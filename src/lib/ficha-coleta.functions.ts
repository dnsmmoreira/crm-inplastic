/**
 * Ficha de Coleta — acesso a dados.
 *
 * Acesso (decisão do Denis): vendedor dono do pedido + operacional + admin —
 * o mesmo escopo de quem já vê/move o pedido. Isso está garantido na RLS pela
 * função `pode_acessar_ficha_pedido(pedido_id)`; aqui só usamos o client do
 * usuário, então a política é a fonte da verdade.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.middleware";
import {
  FICHA_STATUS,
  derivarItemDoProduto,
  fichaEditavel,
  podeTransicionarFicha,
  totaisFicha,
  validarEmissao,
  type FichaStatus,
} from "@/lib/ficha-coleta";

type LooseClient = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type FichaItemRow = {
  id: string;
  produto_id: string | null;
  sku: string | null;
  descricao: string;
  quantidade: number;
  unidade: string | null;
  peso_kg: number | null;
  cubagem_m3: number | null;
  peso_manual: boolean;
  cubagem_manual: boolean;
  position: number;
};

export type FichaRow = {
  id: string;
  numero: string;
  pedido_id: string;
  emitter_id: string | null;
  status: FichaStatus;
  transportadora_id: string | null;
  transportadora_nome: string | null;
  modalidade_entrega: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  previsao_coleta_data: string | null;
  previsao_coleta_hora: string | null;
  motorista: string | null;
  placa: string | null;
  motorista_documento: string | null;
  volumes: string | null;
  observacoes: string | null;
  peso_total_kg: number;
  cubagem_m3: number;
  snapshot: Record<string, any> | null;
  emitida_em: string | null;
  coletada_em: string | null;
  cancelada_em: string | null;
  cancelamento_motivo: string | null;
  created_at: string;
  updated_at: string;
};

export type FichaHistoricoRow = {
  id: string;
  tipo: string;
  descricao: string;
  status_anterior: string | null;
  status_novo: string | null;
  criada_por: string | null;
  created_at: string;
};

const COLS_FICHA =
  "id, numero, pedido_id, emitter_id, status, transportadora_id, transportadora_nome, modalidade_entrega, contato_nome, contato_telefone, previsao_coleta_data, previsao_coleta_hora, motorista, placa, motorista_documento, volumes, observacoes, peso_total_kg, cubagem_m3, snapshot, emitida_em, coletada_em, cancelada_em, cancelamento_motivo, created_at, updated_at";

const COLS_ITEM =
  "id, produto_id, sku, descricao, quantidade, unidade, peso_kg, cubagem_m3, peso_manual, cubagem_manual, position";

async function registrarHistorico(
  sb: LooseClient,
  userId: string,
  input: {
    fichaId: string;
    tipo: string;
    descricao: string;
    statusAnterior?: string | null;
    statusNovo?: string | null;
  },
) {
  const { registrarFalhaSegura } = await import("@/lib/guard-erros");
  const { error } = await sb.from("ficha_coleta_historico").insert({
    ficha_id: input.fichaId,
    tipo: input.tipo,
    descricao: input.descricao,
    status_anterior: input.statusAnterior ?? null,
    status_novo: input.statusNovo ?? null,
    criada_por: userId,
  });
  if (error)
    await registrarFalhaSegura("ficha_coleta_historico", error.message, {
      ficha_id: input.fichaId,
      tipo: input.tipo,
    });
}

async function carregarFicha(sb: LooseClient, id: string): Promise<FichaRow> {
  const { data, error } = await sb.from("fichas_coleta").select(COLS_FICHA).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar a ficha: ${error.message}`);
  if (!data) throw new Error("Ficha não encontrada (ou sem acesso).");
  return data as FichaRow;
}

async function carregarItens(sb: LooseClient, fichaId: string): Promise<FichaItemRow[]> {
  const { data, error } = await sb
    .from("ficha_coleta_itens")
    .select(COLS_ITEM)
    .eq("ficha_id", fichaId)
    .order("position", { ascending: true });
  if (error) throw new Error(`Falha ao carregar os itens: ${error.message}`);
  return (data ?? []) as FichaItemRow[];
}

async function recalcularTotais(sb: LooseClient, fichaId: string) {
  const itens = await carregarItens(sb, fichaId);
  const t = totaisFicha(itens);
  await sb
    .from("fichas_coleta")
    .update({ peso_total_kg: t.peso_kg, cubagem_m3: t.cubagem_m3 })
    .eq("id", fichaId);
  return t;
}

/** Fichas de um pedido (ou as últimas, quando não vem pedido). */
export const listarFichasColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pedido_id: z.string().uuid().optional(),
        status: z.enum(FICHA_STATUS).optional(),
        limite: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    let q = sb
      .from("fichas_coleta")
      .select(`${COLS_FICHA}, pedidos:pedido_id(number, stage)`)
      .order("created_at", { ascending: false })
      .limit(data.limite ?? 100);
    if (data.pedido_id) q = q.eq("pedido_id", data.pedido_id);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(`Falha ao listar fichas: ${error.message}`);
    return (rows ?? []) as Array<FichaRow & { pedidos: { number: string; stage: string } | null }>;
  });

export const getFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const ficha = await carregarFicha(sb, data.id);
    const [itens, histRes, pedidoRes, emitterRes] = await Promise.all([
      carregarItens(sb, ficha.id),
      sb
        .from("ficha_coleta_historico")
        .select("id, tipo, descricao, status_anterior, status_novo, criada_por, created_at")
        .eq("ficha_id", ficha.id)
        .order("created_at", { ascending: false }),
      sb
        .from("pedidos")
        .select("id, number, stage, status, previsao_entrega, lead_id, vendedor_proprietario_id, owner_id")
        .eq("id", ficha.pedido_id)
        .maybeSingle(),
      ficha.emitter_id
        ? sb.from("emitters").select("*").eq("id", ficha.emitter_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      ficha,
      itens,
      historico: (histRes.data ?? []) as FichaHistoricoRow[],
      pedido: pedidoRes.data as Record<string, any> | null,
      emitente: emitterRes.data as Record<string, any> | null,
    };
  });

/**
 * Cria a ficha em rascunho a partir do pedido. O número vem do banco com trava
 * e nunca é reaproveitado (cancelar não devolve o número).
 */
export const criarFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pedido_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;

    const { data: pedido, error: errPedido } = await sb
      .from("pedidos")
      .select(
        "id, number, lead_id, transportadora, modalidade_entrega, previsao_entrega, proposta_snapshot, vendedor_proprietario_id, owner_id",
      )
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (errPedido) throw new Error(`Falha ao carregar o pedido: ${errPedido.message}`);
    if (!pedido) throw new Error("Pedido não encontrado (ou sem acesso).");

    const snapProposta = ((pedido.proposta_snapshot as Record<string, any> | null)?.proposta ??
      {}) as Record<string, unknown>;
    const emitterIdPedido = (snapProposta.emitter_id as string | null) ?? null;

    const [emitterRes, itensRes, transpRes] = await Promise.all([
      emitterIdPedido
        ? sb.from("emitters").select("*").eq("id", emitterIdPedido).maybeSingle()
        : sb.from("emitters").select("*").eq("is_default", true).maybeSingle(),
      sb
        .from("pedido_itens")
        .select("sku, description, quantity, unit, product_id, position")
        .eq("pedido_id", pedido.id)
        .order("position", { ascending: true }),
      pedido.transportadora
        ? sb.from("transportadoras").select("id, nome").eq("nome", pedido.transportadora).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (itensRes.error) throw new Error(`Falha ao carregar itens do pedido: ${itensRes.error.message}`);

    const emitente = emitterRes.data as Record<string, any> | null;
    const itensPedido = (itensRes.data ?? []) as Array<{
      sku: string;
      description: string;
      quantity: number;
      unit: string;
      product_id: string | null;
      position: number;
    }>;

    // Medidas vêm do cadastro de produto; zero/ausente exige entrada manual.
    const skus = Array.from(new Set(itensPedido.map((i) => i.sku).filter(Boolean)));
    const { data: produtos } = skus.length
      ? await sb.from("produtos").select("id, sku, weight_kg, height_cm, width_cm, length_cm").in("sku", skus)
      : { data: [] as any[] };
    const porSku = new Map<string, any>();
    for (const p of (produtos ?? []) as any[]) porSku.set(String(p.sku), p);

    const ano = new Date().getUTCFullYear();
    const { data: numero, error: errNumero } = await sb.rpc("next_ficha_coleta_number", {
      _year: ano,
    });
    if (errNumero || !numero) throw new Error(`Falha ao gerar o número da ficha: ${errNumero?.message ?? "sem número"}`);

    const { data: ficha, error: errFicha } = await sb
      .from("fichas_coleta")
      .insert({
        numero,
        pedido_id: pedido.id,
        emitter_id: emitente?.id ?? null,
        status: "rascunho",
        transportadora_id: (transpRes.data as { id?: string } | null)?.id ?? null,
        transportadora_nome: pedido.transportadora ?? null,
        modalidade_entrega: pedido.modalidade_entrega ?? null,
        contato_nome: emitente?.contato_coleta_nome ?? null,
        contato_telefone: emitente?.contato_coleta_telefone ?? null,
        created_by: context.userId,
      })
      .select(COLS_FICHA)
      .single();
    if (errFicha) throw new Error(`Falha ao criar a ficha: ${errFicha.message}`);

    if (itensPedido.length > 0) {
      const linhas = itensPedido.map((i, idx) => {
        const calc = derivarItemDoProduto(porSku.get(i.sku) ?? null, Number(i.quantity ?? 0));
        return {
          ficha_id: (ficha as FichaRow).id,
          produto_id: i.product_id ?? porSku.get(i.sku)?.id ?? null,
          sku: i.sku,
          descricao: i.description,
          quantidade: Number(i.quantity ?? 0),
          unidade: i.unit,
          peso_kg: calc.peso_kg,
          cubagem_m3: calc.cubagem_m3,
          peso_manual: false,
          cubagem_manual: false,
          position: Number(i.position ?? idx),
        };
      });
      const { error: errItens } = await sb.from("ficha_coleta_itens").insert(linhas);
      if (errItens) throw new Error(`Falha ao copiar os itens: ${errItens.message}`);
      await recalcularTotais(sb, (ficha as FichaRow).id);
    }

    await registrarHistorico(sb, context.userId, {
      fichaId: (ficha as FichaRow).id,
      tipo: "criada",
      descricao: `Ficha ${numero} criada a partir do pedido ${pedido.number}`,
      statusNovo: "rascunho",
    });

    return await carregarFicha(sb, (ficha as FichaRow).id);
  });

/** Edição dos dados manuais — só enquanto rascunho. */
export const atualizarFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        transportadora_id: z.string().uuid().nullable().optional(),
        transportadora_nome: z.string().trim().max(160).nullable().optional(),
        modalidade_entrega: z.string().trim().max(40).nullable().optional(),
        contato_nome: z.string().trim().max(120).nullable().optional(),
        contato_telefone: z.string().trim().max(40).nullable().optional(),
        previsao_coleta_data: z.string().trim().max(10).nullable().optional(),
        previsao_coleta_hora: z.string().trim().max(20).nullable().optional(),
        motorista: z.string().trim().max(120).nullable().optional(),
        placa: z.string().trim().max(20).nullable().optional(),
        volumes: z.string().trim().max(160).nullable().optional(),
        observacoes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const ficha = await carregarFicha(sb, data.id);
    if (!fichaEditavel(ficha.status))
      throw new Error("Ficha já emitida: os dados estão congelados. Cancele e gere uma nova.");

    const { id, ...patch } = data;
    const campos = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (campos.length === 0) return ficha;

    const { error } = await sb.from("fichas_coleta").update(Object.fromEntries(campos)).eq("id", id);
    if (error) throw new Error(`Falha ao salvar a ficha: ${error.message}`);

    await registrarHistorico(sb, context.userId, {
      fichaId: id,
      tipo: "editada",
      descricao: `Campos alterados: ${campos.map(([k]) => k).join(", ")}`,
    });
    return await carregarFicha(sb, id);
  });

/** Peso/cubagem digitados à mão ficam marcados como manuais (auditável). */
export const atualizarItemFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        item_id: z.string().uuid(),
        peso_kg: z.number().min(0).max(1_000_000).nullable().optional(),
        cubagem_m3: z.number().min(0).max(100_000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const { data: item, error: errItem } = await sb
      .from("ficha_coleta_itens")
      .select("id, ficha_id, descricao")
      .eq("id", data.item_id)
      .maybeSingle();
    if (errItem) throw new Error(`Falha ao carregar o item: ${errItem.message}`);
    if (!item) throw new Error("Item não encontrado (ou sem acesso).");

    const ficha = await carregarFicha(sb, item.ficha_id as string);
    if (!fichaEditavel(ficha.status))
      throw new Error("Ficha já emitida: os itens estão congelados.");

    const patch: Record<string, unknown> = {};
    if (data.peso_kg !== undefined) {
      patch.peso_kg = data.peso_kg;
      patch.peso_manual = data.peso_kg !== null;
    }
    if (data.cubagem_m3 !== undefined) {
      patch.cubagem_m3 = data.cubagem_m3;
      patch.cubagem_manual = data.cubagem_m3 !== null;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await sb.from("ficha_coleta_itens").update(patch).eq("id", data.item_id);
    if (error) throw new Error(`Falha ao salvar o item: ${error.message}`);

    const totais = await recalcularTotais(sb, ficha.id);
    await registrarHistorico(sb, context.userId, {
      fichaId: ficha.id,
      tipo: "item_editado",
      descricao: `Peso/cubagem informados manualmente em "${item.descricao}"`,
    });
    return { ok: true as const, totais };
  });

/** Emissão: valida, congela o snapshot e fecha a ficha para edição. */
export const emitirFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const ficha = await carregarFicha(sb, data.id);
    const itens = await carregarItens(sb, ficha.id);

    const check = validarEmissao({
      status: ficha.status,
      itens,
      contato_nome: ficha.contato_nome,
      contato_telefone: ficha.contato_telefone,
    });
    if (!check.ok) throw new Error(check.motivo);

    const { data: pedido } = await sb
      .from("pedidos")
      .select("id, number, stage, previsao_entrega, lead_id, total, vendedor_proprietario_id, owner_id")
      .eq("id", ficha.pedido_id)
      .maybeSingle();

    const [leadRes, emitterRes, transpRes, vendedorRes] = await Promise.all([
      pedido?.lead_id
        ? sb
            .from("leads")
            .select(
              "id, company, razao_social, cnpj, contact_name, phone, cep, endereco, numero, complemento, bairro, cidade, estado",
            )
            .eq("id", pedido.lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ficha.emitter_id
        ? sb.from("emitters").select("*").eq("id", ficha.emitter_id).maybeSingle()
        : Promise.resolve({ data: null }),
      ficha.transportadora_id
        ? sb.from("transportadoras").select("*").eq("id", ficha.transportadora_id).maybeSingle()
        : Promise.resolve({ data: null }),
      pedido?.vendedor_proprietario_id ?? pedido?.owner_id
        ? sb
            .from("profiles")
            .select("id, name")
            .eq("id", pedido.vendedor_proprietario_id ?? pedido.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const totais = totaisFicha(itens);
    const snapshot = {
      congelado_em: new Date().toISOString(),
      pedido: pedido ?? null,
      cliente: leadRes.data ?? null,
      emitente: emitterRes.data ?? null,
      transportadora: transpRes.data ?? { nome: ficha.transportadora_nome },
      vendedor: vendedorRes.data ?? null,
      modalidade_entrega: ficha.modalidade_entrega,
      contato: { nome: ficha.contato_nome, telefone: ficha.contato_telefone },
      coleta: {
        previsao_data: ficha.previsao_coleta_data,
        previsao_hora: ficha.previsao_coleta_hora,
        motorista: ficha.motorista,
        placa: ficha.placa,
        volumes: ficha.volumes,
        observacoes: ficha.observacoes,
      },
      itens,
      totais,
    };

    // Igual ao rollback da devolução: RLS pode recusar em silêncio (0 linhas,
    // sem erro). Só confirmamos a emissão se a linha realmente foi gravada.
    const { data: emitidas, error } = await sb
      .from("fichas_coleta")
      .update({
        status: "emitida",
        snapshot,
        peso_total_kg: totais.peso_kg,
        cubagem_m3: totais.cubagem_m3,
        emitida_em: new Date().toISOString(),
        emitida_por: context.userId,
      })
      .eq("id", ficha.id)
      .eq("status", "rascunho")
      .select("id");
    if (error) throw new Error(`Falha ao emitir a ficha: ${error.message}`);
    if (!Array.isArray(emitidas) || emitidas.length === 0) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("ficha_coleta_emissao", "update não afetou nenhuma linha", {
        ficha_id: ficha.id,
        numero: ficha.numero,
      });
      throw new Error(
        "A ficha não pôde ser emitida (o banco não aceitou a gravação). Nada foi alterado — avise o administrador.",
      );
    }

    await registrarHistorico(sb, context.userId, {
      fichaId: ficha.id,
      tipo: "status",
      descricao: `Ficha ${ficha.numero} emitida — dados congelados`,
      statusAnterior: "rascunho",
      statusNovo: "emitida",
    });
    return await carregarFicha(sb, ficha.id);
  });

export const mudarStatusFichaColeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["em_coleta", "coletada", "cancelada"]),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const ficha = await carregarFicha(sb, data.id);
    if (!podeTransicionarFicha(ficha.status, data.status))
      throw new Error(`Não é possível ir de "${ficha.status}" para "${data.status}".`);
    if (data.status === "cancelada" && !data.motivo?.trim())
      throw new Error("Informe o motivo do cancelamento.");

    const agora = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "em_coleta") patch.em_coleta_em = agora;
    if (data.status === "coletada") {
      patch.coletada_em = agora;
      patch.coletada_por = context.userId;
    }
    if (data.status === "cancelada") {
      patch.cancelada_em = agora;
      patch.cancelada_por = context.userId;
      patch.cancelamento_motivo = data.motivo?.trim() ?? null;
    }

    const { data: alteradas, error } = await sb
      .from("fichas_coleta")
      .update(patch)
      .eq("id", ficha.id)
      .eq("status", ficha.status)
      .select("id");
    if (error) throw new Error(`Falha ao atualizar o status: ${error.message}`);
    if (!Array.isArray(alteradas) || alteradas.length === 0) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("ficha_coleta_status", "update não afetou nenhuma linha", {
        ficha_id: ficha.id,
        de: ficha.status,
        para: data.status,
      });
      throw new Error(
        "O status não pôde ser alterado (o banco não aceitou a gravação ou a ficha mudou em outra tela). Recarregue e tente de novo.",
      );
    }

    await registrarHistorico(sb, context.userId, {
      fichaId: ficha.id,
      tipo: "status",
      descricao:
        data.status === "cancelada"
          ? `Ficha cancelada — ${data.motivo?.trim()} (o número ${ficha.numero} não é reaproveitado)`
          : `Status alterado para ${data.status}`,
      statusAnterior: ficha.status,
      statusNovo: data.status,
    });
    return await carregarFicha(sb, ficha.id);
  });

export const registrarImpressaoFicha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const ficha = await carregarFicha(sb, data.id);
    await registrarHistorico(sb, context.userId, {
      fichaId: ficha.id,
      tipo: "impressa",
      descricao: `Ficha ${ficha.numero} impressa/gerada em PDF`,
    });
    return { ok: true as const };
  });

export type FichaPublica = {
  numero: string;
  status: FichaStatus;
  emitida_em: string | null;
  pedido_numero: string | null;
  cliente: string | null;
  transportadora: string | null;
  endereco_coleta: string | null;
  horario_coleta: string | null;
  peso_total_kg: number;
  cubagem_m3: number;
  itens: Array<{ sku: string | null; descricao: string; quantidade: number; unidade: string | null }>;
};

/**
 * Consulta pública da ficha (QR code). Sem sessão, sem valores financeiros:
 * só confere se o documento é legítimo e qual o estado dele.
 */
export const getFichaColetaPublica = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FichaPublica | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("fichas_coleta")
      .select("numero, status, emitida_em, snapshot, peso_total_kg, cubagem_m3")
      .eq("id", data.id)
      .maybeSingle();
    if (!f) return null;
    if (f.status === "rascunho") return null; // rascunho não é documento válido

    const snap = (f.snapshot ?? {}) as Record<string, any>;
    const itens = Array.isArray(snap.itens) ? snap.itens : [];
    return {
      numero: f.numero,
      status: f.status as FichaStatus,
      emitida_em: f.emitida_em,
      pedido_numero: snap.pedido?.number ?? null,
      cliente: snap.cliente?.razao_social ?? snap.cliente?.company ?? null,
      transportadora: snap.transportadora?.nome ?? null,
      endereco_coleta: snap.emitente?.endereco_coleta ?? snap.emitente?.address ?? null,
      horario_coleta: snap.emitente?.horario_coleta ?? null,
      peso_total_kg: Number(f.peso_total_kg ?? 0),
      cubagem_m3: Number(f.cubagem_m3 ?? 0),
      itens: itens.map((i: any) => ({
        sku: i.sku ?? null,
        descricao: String(i.descricao ?? ""),
        quantidade: Number(i.quantidade ?? 0),
        unidade: i.unidade ?? null,
      })),
    };
  });
