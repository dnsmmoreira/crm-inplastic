import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { garantirClienteDoLead } from "@/lib/clientes.functions";


/**
 * Fluxo interno de fechamento de pedido — SEM integração externa (nenhum ERP).
 * O nome do arquivo é mantido apenas por compatibilidade com imports existentes;
 * toda a lógica é interna ao CRM.
 *
 * `gerarPedidoInterno`:
 *   - Marca a proposta como `status='pedido'` (idempotente).
 *   - Move o lead para `stage='ganho'` automaticamente.
 *   - Retorna `{ ok, validacao_erros? }` — sem chamadas externas.
 *
 * `moverParaGanho`:
 *   - Gate do kanban: só permite mover para ganho se houver proposta com `status='pedido'`.
 *
 * Aliases `gerarPedidoOmie` / `moverParaGanhoOmie` são mantidos como re-export
 * para não quebrar imports legados; devem ser removidos em uma etapa futura.
 */

export type InternalOrderResult = {
  ok: boolean;
  validacao_erros?: string[];
  proposta_id?: string;
  pedido_number?: string;
};

export type OmieResult = InternalOrderResult;
export type MoverParaGanhoOmieResult = InternalOrderResult;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;
function relaxSupabase(sb: unknown): LooseClient {
  return sb as LooseClient;
}

export const gerarPedidoInterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposta_id: string; requer_aprovacao?: boolean }) =>
    z
      .object({
        proposta_id: z.string().uuid(),
        requer_aprovacao: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const { supabase, userId } = context;
    const loose: LooseClient = relaxSupabase(supabase);
    const propostaId = data.proposta_id;

    const { data: proposta, error: propErr } = await loose
      .from("propostas")
      .select("id, status, lead_id, payment_term_id")
      .eq("id", propostaId)
      .maybeSingle();
    if (propErr) throw new Error(`Falha ao carregar proposta: ${propErr.message}`);
    if (!proposta) throw new Error("Proposta não encontrada");

    const leadId = proposta.lead_id as string | null;
    if (!leadId) {
      return {
        ok: false,
        proposta_id: propostaId,
        validacao_erros: ["Proposta sem lead vinculado."],
      };
    }

    // Valida itens mínimos
    const { data: itens, error: itErr } = await loose
      .from("proposta_itens")
      .select("id, quantity, unit_price")
      .eq("proposta_id", propostaId);
    if (itErr) throw new Error(`Falha ao carregar itens: ${itErr.message}`);
    const erros: string[] = [];
    if (!itens || itens.length === 0) {
      erros.push("Adicione pelo menos 1 item à proposta antes de gerar o pedido.");
    } else if (itens.some((i: { unit_price: number }) => Number(i.unit_price) <= 0)) {
      erros.push("Todos os itens precisam de valor unitário maior que zero.");
    }
    // Pessoa Física: bloqueia condições a prazo/boleto (apenas à vista ou cartão).
    const { data: leadRow } = await loose
      .from("leads")
      .select("cliente_id")
      .eq("id", leadId)
      .maybeSingle();
    if (leadRow?.cliente_id) {
      const { data: cli } = await loose
        .from("clientes")
        .select("tipo_pessoa")
        .eq("id", leadRow.cliente_id)
        .maybeSingle();
      if (cli?.tipo_pessoa === "PF") {
        const termId = proposta.payment_term_id as string | null;
        if (!termId) {
          erros.push("Cliente Pessoa Física: selecione uma condição de pagamento à vista ou cartão.");
        } else {
          const { data: term } = await loose
            .from("condicoes_pagamento")
            .select("permite_pf, label")
            .eq("id", termId)
            .maybeSingle();
          if (!term?.permite_pf) {
            erros.push(
              `Condição "${term?.label ?? termId}" não é permitida para Pessoa Física — use à vista ou cartão.`,
            );
          }
        }
      }
    }

    if (erros.length > 0) {
      return { ok: false, validacao_erros: erros, proposta_id: propostaId };
    }

    // Gate + promoção automática lead → cliente (exige CNPJ/CPF válido).
    const promo = await garantirClienteDoLead(loose, userId, leadId);
    if (!promo.ok) {
      return { ok: false, validacao_erros: promo.erros, proposta_id: propostaId };
    }



    // Fluxo de aprovação (mantém o gate existente).
    if (proposta.status !== "pedido") {
      if (data.requer_aprovacao) {
        await loose
          .from("propostas")
          .update({
            status: "aguardando_aprovacao",
            approval_requested_at: new Date().toISOString(),
            approval_reason: "Geração de pedido requer autorização do supervisor",
          })
          .eq("id", propostaId);
        return {
          ok: false,
          proposta_id: propostaId,
          validacao_erros: ["Aguardando liberação do supervisor para gerar pedido."],
        };
      }

      const nowIso = new Date().toISOString();
      await loose
        .from("propostas")
        .update({
          status: "pedido",
          approved_by_user_id: userId,
          approved_at: nowIso,
          order_created_at: nowIso,
        })
        .eq("id", propostaId);
    }

    // Move o lead para ganho automaticamente.
    await loose.from("leads").update({ stage: "ganho" }).eq("id", leadId);

    return { ok: true, proposta_id: propostaId };
  });

export const moverParaGanho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const loose: LooseClient = relaxSupabase(context.supabase);
    const { data: prop, error } = await loose
      .from("propostas")
      .select("id")
      .eq("lead_id", data.lead_id)
      .eq("status", "pedido")
      .order("order_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar proposta: ${error.message}`);
    if (!prop) {
      return {
        ok: false,
        validacao_erros: [
          "Gere o pedido em uma proposta antes de mover para Ganho.",
        ],
      };
    }

    // Gate + promoção automática lead → cliente (exige CNPJ/CPF válido).
    const promo = await garantirClienteDoLead(loose, context.userId, data.lead_id);
    if (!promo.ok) {
      return { ok: false, validacao_erros: promo.erros };
    }

    await loose.from("leads").update({ stage: "ganho" }).eq("id", data.lead_id);


    // Fase 2 — cria pedido operacional interno de forma idempotente.
    // Não bloqueia o Ganho se algo falhar aqui (idempotência protege reexecução).
    try {
      await ensurePedidoFromProposta(loose, {
        propostaId: prop.id as string,
        leadId: data.lead_id,
        callerId: context.userId,
      });
    } catch (e) {
      console.error("[moverParaGanhoOmie] falha ao criar pedido operacional:", e);
    }

    return { ok: true, proposta_id: prop.id as string };
  });

/**
 * Cria (ou reutiliza) o pedido operacional interno a partir de uma proposta aceita.
 * Idempotente por `pedidos.proposta_id` (índice único parcial).
 *
 * Regras (Fase 2):
 * - stage inicial = 'pedido_recebido'
 * - fiscal_status = 'nao_iniciado', pos_venda_status = 'nao_iniciado'
 * - vendedor_proprietario_id = owner da proposta
 * - responsavel_atual_id = null ("Julia" não existe como usuário no projeto);
 *   equipe_responsavel = 'Julia (Operações)' documenta a intenção
 * - proposta_snapshot = cópia imutável (proposta + itens + parcelas + emitter + lead)
 * - copia itens de proposta_itens para pedido_itens
 * - número via next_pedido_number(ano corrente)
 */
async function ensurePedidoFromProposta(
  sb: LooseClient,
  args: { propostaId: string; leadId: string; callerId: string },
): Promise<{ id: string; number: string; reused: boolean }> {
  const { propostaId, leadId, callerId } = args;

  // 1) Idempotência
  const { data: existing, error: existErr } = await sb
    .from("pedidos")
    .select("id, number")
    .eq("proposta_id", propostaId)
    .maybeSingle();
  if (existErr) throw new Error(`Falha ao checar pedido existente: ${existErr.message}`);
  if (existing) return { id: existing.id, number: existing.number, reused: true };

  // 2) Carrega proposta + itens + parcelas + emitter + lead
  const [propRes, itensRes, parcelasRes] = await Promise.all([
    sb.from("propostas").select("*").eq("id", propostaId).maybeSingle(),
    sb.from("proposta_itens").select("*").eq("proposta_id", propostaId).order("position", { ascending: true }),
    sb.from("proposta_parcelas").select("*").eq("proposta_id", propostaId).order("position", { ascending: true }),
  ]);
  if (propRes.error) throw new Error(`Falha ao carregar proposta: ${propRes.error.message}`);
  const proposta = propRes.data;
  if (!proposta) throw new Error("Proposta não encontrada");
  const itens = itensRes.data ?? [];
  const parcelas = parcelasRes.data ?? [];

  const [emitterRes, leadRes] = await Promise.all([
    proposta.emitter_id
      ? sb.from("emitters").select("*").eq("id", proposta.emitter_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("leads").select("*").eq("id", leadId).maybeSingle(),
  ]);

  // 3) Total (subtotal dos itens com desconto% da proposta)
  const subtotal = itens.reduce(
    (s: number, i: { quantity: number; unit_price: number }) =>
      s + Number(i.quantity) * Number(i.unit_price),
    0,
  );
  const descontoPct = Number(proposta.discount_percent ?? 0);
  const total = subtotal * (1 - descontoPct / 100);

  // 4) Número do pedido
  const ano = new Date().getFullYear();
  const { data: numData, error: numErr } = await sb.rpc("next_pedido_number", { _year: ano });
  if (numErr) throw new Error(`Falha ao gerar número do pedido: ${numErr.message}`);
  const number = numData as string;

  // 5) Snapshot imutável
  const proposta_snapshot = {
    versao: 1,
    capturado_em: new Date().toISOString(),
    capturado_por_user_id: callerId,
    proposta,
    itens,
    parcelas,
    emitter: emitterRes.data ?? null,
    lead: leadRes.data ?? null,
  };

  // 6) Insere pedido
  const { data: novoPedido, error: insErr } = await sb
    .from("pedidos")
    .insert({
      number,
      proposta_id: propostaId,
      lead_id: leadId,
      owner_id: proposta.owner_id,
      vendedor_proprietario_id: proposta.owner_id,
      responsavel_atual_id: null,
      equipe_responsavel: "Julia (Operações)",
      status: "novo",
      stage: "pedido_recebido",
      fiscal_status: "nao_iniciado",
      pos_venda_status: "nao_iniciado",
      total,
      previsao_entrega: proposta.expected_delivery_date ?? null,
      proposta_snapshot,
      metadata: {
        origem: "conversao_ganho",
        proposta_number: proposta.number,
        numero_pedido_cliente: proposta.numero_pedido_cliente ?? null,
      },
    })
    .select("id, number")
    .single();
  if (insErr) {
    // Corrida com índice único: outra transação já criou — retorna o existente
    if ((insErr as { code?: string }).code === "23505") {
      const { data: raced } = await sb
        .from("pedidos")
        .select("id, number")
        .eq("proposta_id", propostaId)
        .maybeSingle();
      if (raced) return { id: raced.id, number: raced.number, reused: true };
    }
    throw new Error(`Falha ao criar pedido: ${insErr.message}`);
  }

  // 7) Copia itens
  if (itens.length > 0) {
    const rows = itens.map((i: {
      product_id: string | null; sku: string; description: string;
      unit: string; quantity: number; unit_price: number; position: number;
    }) => ({
      pedido_id: novoPedido.id,
      product_id: i.product_id,
      sku: i.sku,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      position: i.position,
    }));
    const { error: itErr } = await sb.from("pedido_itens").insert(rows);
    if (itErr) throw new Error(`Falha ao copiar itens do pedido: ${itErr.message}`);
  }

  return { id: novoPedido.id, number: novoPedido.number, reused: false };
}

/**
 * Aliases legados — mantidos para não quebrar imports existentes.
 * Preferir `gerarPedidoInterno` / `moverParaGanho` em código novo.
 */
export const gerarPedidoOmie = gerarPedidoInterno;
export const moverParaGanhoOmie = moverParaGanho;
