import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { garantirClienteDoLead } from "@/lib/clientes.functions";
import { computeLeadScore } from "@/lib/lead-score";
import { decidirAprovacaoFinanceira } from "@/lib/aprovacao-financeira";
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";

/**
 * Fluxo interno de fechamento de pedido — SEM integração externa (nenhum ERP).
 * Este é o ÚNICO ponto que cria pedido no sistema.
 *
 * `gerarPedidoInterno`:
 *   - Marca a proposta como `status='pedido'` (idempotente).
 *   - Move o lead para `stage='ganho'` automaticamente.
 *   - Retorna `{ ok, validacao_erros? }` — sem chamadas externas.
 *
 * `moverParaGanho`:
 *   - Gate do kanban: só permite mover para ganho se houver proposta com `status='pedido'`.
 *
 * Aliases `gerarPedidoOmie` / `moverParaGanhoOmie` seguem exportados como
 * re-export @deprecated apenas para não mexer nos call sites agora.
 */

export type InternalOrderResult = {
  ok: boolean;
  validacao_erros?: string[];
  proposta_id?: string;
  pedido_number?: string;
  /** Id do pedido operacional criado — usado pelo gatilho de romaneios na UI. */
  pedido_id?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;
function relaxSupabase(sb: unknown): LooseClient {
  return sb as LooseClient;
}

export const gerarPedidoInterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      proposta_id: string;
      requer_aprovacao?: boolean;
      conferencia_confirmada?: boolean;
    }) =>
      z
        .object({
          proposta_id: z.string().uuid(),
          requer_aprovacao: z.boolean().optional(),
          conferencia_confirmada: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }): Promise<InternalOrderResult> => {
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
      .select(
        "cliente_id, data_abertura, capital_social, porte, simples_optante, inscricao_estadual, socios, cnpj, razao_social",
      )
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
          erros.push(
            "Cliente Pessoa Física: selecione uma condição de pagamento à vista ou cartão.",
          );
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

    // Fluxo de aprovação. Admin continua com bypass total (o client envia
    // `requer_aprovacao=false`); para o vendedor, o motivo/decisão são
    // calculados AQUI — nunca vindos do client.
    if (proposta.status !== "pedido") {
      let motivoAuditoria: string | null = null;
      let precisaAprovacao = Boolean(data.requer_aprovacao);

      if (data.requer_aprovacao) {
        const valorTotal = (itens ?? []).reduce(
          (s: number, i: { quantity: number; unit_price: number }) =>
            s + Number(i.quantity ?? 0) * Number(i.unit_price ?? 0),
          0,
        );

        const { count } = await loose
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", leadId)
          .neq("proposta_id", propostaId);
        const pedidosAnteriores = Number(count ?? 0);

        const score = computeLeadScore({
          dataAbertura: leadRow?.data_abertura ?? undefined,
          capitalSocial:
            leadRow?.capital_social !== null && leadRow?.capital_social !== undefined
              ? Number(leadRow.capital_social)
              : undefined,
          porte: leadRow?.porte ?? undefined,
          simplesOptante: leadRow?.simples_optante ?? undefined,
          inscricaoEstadual: leadRow?.inscricao_estadual ?? undefined,
          socios: Array.isArray(leadRow?.socios) ? leadRow.socios : undefined,
          cnpj: leadRow?.cnpj ?? undefined,
          razaoSocial: leadRow?.razao_social ?? undefined,
        });

        const decisao = decidirAprovacaoFinanceira({ valorTotal, pedidosAnteriores, score });
        precisaAprovacao = decisao.requerAprovacao;
        motivoAuditoria = decisao.motivo;
      }

      // Auditoria da conferência final feita na tela da proposta.
      // O timestamp é sempre gerado no servidor — o client só envia o flag.
      const conferencia: Record<string, unknown> = data.conferencia_confirmada
        ? {
            conferencia_confirmada_em: new Date().toISOString(),
            conferencia_confirmada_por_user_id: userId,
          }
        : {};

      if (precisaAprovacao) {
        // ABORTAR: sem o status coerente, a proposta ficaria "livre" e o
        // pedido poderia nascer sem passar pela aprovação.
        const upAguardando = await loose
          .from("propostas")
          .update({
            status: "aguardando_aprovacao",
            approval_requested_at: new Date().toISOString(),
            approval_reason: motivoAuditoria,
            ...conferencia,
          })
          .eq("id", propostaId);
        await assertNoError(
          upAguardando,
          "pedidos-gerar.gerarPedidoInterno/aguardando-aprovacao",
          { proposta_id: propostaId },
          "Não foi possível enviar a proposta para aprovação. Tente novamente.",
        );
        return {
          ok: false,
          proposta_id: propostaId,
          validacao_erros: ["Aguardando liberação do supervisor para gerar pedido."],
        };
      }

      const nowIso = new Date().toISOString();
      const patchAprovacao: Record<string, unknown> = {
        status: "pedido",
        approved_by_user_id: userId,
        approved_at: nowIso,
        order_created_at: nowIso,
        ...conferencia,
      };
      // Rastro de auditoria do auto-aprovado (admin não grava motivo).
      if (motivoAuditoria) patchAprovacao["approval_reason"] = motivoAuditoria;
      // ABORTAR: o pedido não pode nascer com a proposta em status incoerente.
      const upAprovada = await loose.from("propostas").update(patchAprovacao).eq("id", propostaId);
      await assertNoError(
        upAprovada,
        "pedidos-gerar.gerarPedidoInterno/aprovar-proposta",
        { proposta_id: propostaId },
        "Não foi possível atualizar o status da proposta. Tente novamente.",
      );
    }

    // ABORTAR: o pedido depende do lead em "ganho".
    const upLead = await loose.from("leads").update({ stage: "ganho" }).eq("id", leadId);
    await assertNoError(
      upLead,
      "pedidos-gerar.gerarPedidoInterno/lead-ganho",
      { lead_id: leadId, proposta_id: propostaId },
      "Não foi possível mover o lead para Ganho. Tente novamente.",
    );

    // Cria (ou reutiliza) o pedido operacional interno — idempotente.
    let pedidoNumber: string | undefined;
    let pedidoId: string | undefined;
    try {
      const ped = await ensurePedidoFromProposta(loose, {
        propostaId,
        leadId,
        callerId: userId,
      });
      pedidoNumber = ped.number;
      pedidoId = ped.id;
    } catch (e) {
      console.error("[gerarPedidoInterno] falha ao criar pedido operacional:", e);
    }

    return {
      ok: true,
      proposta_id: propostaId,
      pedido_number: pedidoNumber,
      pedido_id: pedidoId,
    };
  });

export const moverParaGanho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<InternalOrderResult> => {
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
        validacao_erros: ["Gere o pedido em uma proposta antes de mover para Ganho."],
      };
    }

    // Gate + promoção automática lead → cliente (exige CNPJ/CPF válido).
    const promo = await garantirClienteDoLead(loose, context.userId, data.lead_id);
    if (!promo.ok) {
      return { ok: false, validacao_erros: promo.erros };
    }

    // ABORTAR: o Ganho é o efeito principal desta operação.
    const upLeadGanho = await loose.from("leads").update({ stage: "ganho" }).eq("id", data.lead_id);
    await assertNoError(
      upLeadGanho,
      "pedidos-gerar.moverParaGanho/lead-ganho",
      { lead_id: data.lead_id },
      "Não foi possível mover o lead para Ganho. Tente novamente.",
    );

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
    sb
      .from("proposta_itens")
      .select("*")
      .eq("proposta_id", propostaId)
      .order("position", { ascending: true }),
    sb
      .from("proposta_parcelas")
      .select("*")
      .eq("proposta_id", propostaId)
      .order("position", { ascending: true }),
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

  // 6) Motor de regras de aprovação financeira (parâmetros em arena_config)
  const { avaliarAprovacaoPedido, aoEntrarNaEtapa } = await import("@/lib/pedidos-fluxo.server");
  const decisao = await avaliarAprovacaoPedido(sb, { total, leadId });

  // 7) Insere pedido
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
      stage: decisao.stage,
      aprovacao_rota: decisao.rota,
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
    const rows = itens.map(
      (i: {
        product_id: string | null;
        sku: string;
        description: string;
        unit: string;
        quantity: number;
        unit_price: number;
        position: number;
      }) => ({
        pedido_id: novoPedido.id,
        product_id: i.product_id,
        sku: i.sku,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        position: i.position,
      }),
    );
    const { error: itErr } = await sb.from("pedido_itens").insert(rows);
    if (itErr) throw new Error(`Falha ao copiar itens do pedido: ${itErr.message}`);
  }

  // 9) Histórico da etapa inicial + notificações/automações de entrada
  // REGISTRAR E SEGUIR: histórico de etapa é auxiliar; o pedido já existe e
  // abortar aqui deixaria o pedido criado sem retorno para a tela.
  const histIni = await sb.from("pedido_stage_history").insert({
    pedido_id: novoPedido.id,
    from_stage: null,
    to_stage: decisao.stage,
    is_backward: false,
    motivo: `Rota automática de aprovação: ${decisao.rota}`,
    moved_by: callerId,
  });
  if (histIni?.error) {
    await registrarFalhaSegura(
      "pedidos-gerar.ensurePedidoFromProposta/stage-history",
      histIni.error,
      {
        pedido_id: novoPedido.id,
      },
    );
  }
  // Efeitos de entrada de etapa — mesmos de uma movimentação manual.
  // Nunca podem derrubar a criação do pedido, mas também não podem ser
  // engolidos em silêncio.
  try {
    await aoEntrarNaEtapa(sb, novoPedido.id, decisao.stage);
  } catch (e) {
    console.error(
      `[ensurePedidoFromProposta] efeitos de entrada falharam (pedido=${novoPedido.number}, etapa=${decisao.stage}):`,
      e instanceof Error ? e.message : e,
    );
  }

  return { id: novoPedido.id, number: novoPedido.number, reused: false };
}

/**
 * Aliases legados — mantidos para não quebrar imports existentes.
 * Preferir `gerarPedidoInterno` / `moverParaGanho` em código novo.
 */
/** @deprecated use `gerarPedidoInterno` — alias mantido só pelos call sites atuais. */
export const gerarPedidoOmie = gerarPedidoInterno;
/** @deprecated use `moverParaGanho` — alias mantido só pelos call sites atuais. */
export const moverParaGanhoOmie = moverParaGanho;
