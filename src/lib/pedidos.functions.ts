import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { PERM_PEDIDOS_MOVIMENTAR } from "@/lib/permissoes";
import { descreverParcelas } from "@/lib/condicoes-comerciais";
import { resumoHistoricoCliente, soDigitos, type HistoricoCliente } from "@/lib/pedidos-historico";
export type { HistoricoCliente, PedidoHistoricoRow } from "@/lib/pedidos-historico";

/**
 * Fase 3 — Kanban de Pedidos operacional (coexiste com o Funil de Vendas).
 * Operações puramente sobre `pedidos` e `pedido_stage_history`.
 * Nada altera leads/propostas nem dispara integrações externas.
 */

import {
  PEDIDO_STAGES,
  PEDIDO_STAGE_REPROVADO,
  PEDIDO_STAGE_CANCELADO,
  PEDIDO_STAGE_IDS,
  ALLOWED_FORWARD,
  isBackward,
  podeDevolverPedido,
  stageLabel,
  type PedidoStageId,
} from "@/lib/pedidos-stages";

export {
  PEDIDO_STAGES,
  PEDIDO_STAGE_REPROVADO,
  PEDIDO_STAGE_CANCELADO,
  PEDIDO_STAGE_CANCELADO_LABEL,
  podeDevolverPedido,
  PEDIDO_STAGE_REPROVADO_LABEL,
  PEDIDO_STAGE_IDS,
  ALLOWED_FORWARD,
  isBackward,
  isTransitionAllowed,
  stageLabel,
  stageColor,
  isPedidoFechado,
  MODALIDADES_ENTREGA,
  modalidadeLabel,
  entregaBadgeLabel,
  APROVACAO_ROTA_LABEL,
} from "@/lib/pedidos-stages";
export type { PedidoStageId, ModalidadeEntrega, AprovacaoRota } from "@/lib/pedidos-stages";

export type PedidoRow = {
  id: string;
  number: string;
  stage: PedidoStageId;
  total: number;
  created_at: string;
  stage_changed_at: string;
  previsao_entrega: string | null;
  equipe_responsavel: string | null;
  responsavel_atual_id: string | null;
  responsavel_nome: string | null;
  fiscal_status: string | null;
  nf_numero: string | null;
  forma_atendimento: string | null;
  prioridade: string | null;
  ocorrencia: string | null;
  ocorrencias_abertas: number;
  vendedor_proprietario_id: string | null;
  vendedor_nome: string | null;
  proposta_id: string | null;
  lead_id: string | null;
  lead_company: string | null;
  proposta_number: string | null;
  modalidade_entrega: string | null;
  entrega_confirmada: string | null;
  encerrado_em: string | null;
  aprovacao_rota: string | null;
  reprovacao_motivo: string | null;
  itens: Array<{
    sku: string | null;
    description: string | null;
    quantity: number;
    unit: string | null;
  }>;
  itens_total_qtde: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/**
 * Client de leitura para ENRIQUECIMENTO de exibição (nomes de lead/profile).
 * A autorização real ("posso ver este pedido?") já aconteceu via RLS no client
 * do usuário; aqui só resolvemos rótulos de um pedido já autorizado. Mesmo
 * padrão defensivo de `clienteDeEfeitos` em pedidos-fluxo.server.ts.
 */
async function clienteDeExibicao(sb: LooseClient): Promise<LooseClient> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as LooseClient;
  } catch (e) {
    console.error(
      "[pedidos] client de serviço indisponível, usando client do usuário:",
      e instanceof Error ? e.message : e,
    );
    return sb;
  }
}

export const listPedidos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PedidoRow[]> => {
    const sb: LooseClient = context.supabase;
    const { data, error } = await sb
      .from("pedidos")
      .select(
        [
          "id, number, stage, total, created_at, previsao_entrega",
          "equipe_responsavel, responsavel_atual_id, fiscal_status, nf_numero",
          "forma_atendimento, prioridade, ocorrencia",
          "vendedor_proprietario_id, proposta_id, lead_id",
          "modalidade_entrega, entrega_confirmada, encerrado_em, aprovacao_rota, reprovacao_motivo",
          "propostas:proposta_id(number)",
        ].join(", "),
      )

      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id: string;
      lead_id: string | null;
      vendedor_proprietario_id: string | null;
      responsavel_atual_id: string | null;
    }>;

    // Buscar última transição por pedido para calcular "dias na etapa"
    const ids = rows.map((r) => r.id);
    const lastChangeByPedido = new Map<string, string>();
    const openOcorrByPedido = new Map<string, number>();
    const itensByPedido = new Map<string, PedidoRow["itens"]>();
    if (ids.length > 0) {
      const { data: hist } = await sb
        .from("pedido_stage_history")
        .select("pedido_id, created_at")
        .in("pedido_id", ids)
        .order("created_at", { ascending: false });
      for (const h of (hist ?? []) as Array<{ pedido_id: string; created_at: string }>) {
        if (!lastChangeByPedido.has(h.pedido_id)) lastChangeByPedido.set(h.pedido_id, h.created_at);
      }
      const { data: openOc } = await sb
        .from("pedido_ocorrencias")
        .select("pedido_id")
        .in("pedido_id", ids)
        .eq("resolvida", false);
      for (const o of (openOc ?? []) as Array<{ pedido_id: string }>) {
        openOcorrByPedido.set(o.pedido_id, (openOcorrByPedido.get(o.pedido_id) ?? 0) + 1);
      }
      // Itens de todos os pedidos numa consulta só (nunca N+1).
      const { data: itens } = await sb
        .from("pedido_itens")
        .select("pedido_id, sku, description, quantity, unit, position")
        .in("pedido_id", ids)
        .order("position", { ascending: true });
      for (const it of (itens ?? []) as Array<{
        pedido_id: string;
        sku: string | null;
        description: string | null;
        quantity: number | string | null;
        unit: string | null;
      }>) {
        const arr = itensByPedido.get(it.pedido_id) ?? [];
        arr.push({
          sku: it.sku ?? null,
          description: it.description ?? null,
          quantity: Number(it.quantity ?? 0),
          unit: it.unit ?? null,
        });
        itensByPedido.set(it.pedido_id, arr);
      }
    }

    // Resolver nomes de profiles (vendedor + responsável) e da empresa do lead via
    // lookup separado no client de exibição — a RLS de leads/profiles é restrita ao
    // dono/admin e esconderia os rótulos de um pedido já autorizado pela RLS de pedidos.
    const sbView: LooseClient = await clienteDeExibicao(sb);
    const profileIds = new Set<string>();
    const leadIds = new Set<string>();
    for (const r of rows) {
      if (r.vendedor_proprietario_id) profileIds.add(r.vendedor_proprietario_id);
      if (r.responsavel_atual_id) profileIds.add(r.responsavel_atual_id);
      if (r.lead_id) leadIds.add(r.lead_id);
    }
    const nameById = new Map<string, string>();
    if (profileIds.size > 0) {
      const { data: profs } = await sbView
        .from("profiles")
        .select("id, name")
        .in("id", Array.from(profileIds));
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null }>) {
        if (p.name) nameById.set(p.id, p.name);
      }
    }
    const companyByLead = new Map<string, string>();
    if (leadIds.size > 0) {
      const { data: leadsRows } = await sbView
        .from("leads")
        .select("id, company")
        .in("id", Array.from(leadIds));
      for (const l of (leadsRows ?? []) as Array<{ id: string; company: string | null }>) {
        if (l.company) companyByLead.set(l.id, l.company);
      }
    }

    return (data ?? []).map(
      (r: {
        id: string;
        number: string;
        stage: PedidoStageId;
        total: number;
        created_at: string;
        previsao_entrega: string | null;
        equipe_responsavel: string | null;
        responsavel_atual_id: string | null;
        fiscal_status: string | null;
        nf_numero: string | null;
        forma_atendimento: string | null;
        prioridade: string | null;
        ocorrencia: string | null;
        vendedor_proprietario_id: string | null;
        proposta_id: string | null;
        lead_id: string | null;
        propostas?: { number: string | null } | null;

        modalidade_entrega: string | null;
        entrega_confirmada: string | null;
        encerrado_em: string | null;
        aprovacao_rota: string | null;
        reprovacao_motivo: string | null;
      }) => ({
        id: r.id,
        number: r.number,
        stage: r.stage,
        total: Number(r.total ?? 0),
        created_at: r.created_at,
        stage_changed_at: lastChangeByPedido.get(r.id) ?? r.created_at,
        previsao_entrega: r.previsao_entrega,
        equipe_responsavel: r.equipe_responsavel,
        responsavel_atual_id: r.responsavel_atual_id,
        responsavel_nome: r.responsavel_atual_id
          ? (nameById.get(r.responsavel_atual_id) ?? null)
          : null,
        fiscal_status: r.fiscal_status,
        nf_numero: r.nf_numero,
        forma_atendimento: r.forma_atendimento,
        prioridade: r.prioridade,
        ocorrencia: r.ocorrencia,
        ocorrencias_abertas: openOcorrByPedido.get(r.id) ?? 0,
        vendedor_proprietario_id: r.vendedor_proprietario_id,
        vendedor_nome: r.vendedor_proprietario_id
          ? (nameById.get(r.vendedor_proprietario_id) ?? null)
          : null,
        proposta_id: r.proposta_id,
        lead_id: r.lead_id,
        lead_company: r.lead_id ? (companyByLead.get(r.lead_id) ?? null) : null,
        proposta_number: r.propostas?.number ?? null,
        modalidade_entrega: r.modalidade_entrega ?? "coleta",
        entrega_confirmada: r.entrega_confirmada,
        encerrado_em: r.encerrado_em,
        aprovacao_rota: r.aprovacao_rota,
        reprovacao_motivo: r.reprovacao_motivo,
        itens: itensByPedido.get(r.id) ?? [],
        itens_total_qtde: (itensByPedido.get(r.id) ?? []).reduce(
          (s, i) => s + (i.quantity || 0),
          0,
        ),
      }),
    );
  });

/**
 * Retorna a lista de lead_ids que já geraram algum pedido operacional.
 * Usado pelo Funil de Vendas para esconder ganhos "consumidos" por padrão.
 */
export const listLeadsComPedido = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const sb: LooseClient = context.supabase;
    const { data, error } = await sb.from("pedidos").select("lead_id").not("lead_id", "is", null);
    if (error) throw new Error(`Falha ao listar leads com pedido: ${error.message}`);
    const set = new Set<string>();
    for (const r of (data ?? []) as Array<{ lead_id: string | null }>) {
      if (r.lead_id) set.add(r.lead_id);
    }
    return Array.from(set);
  });

export type MoveStageResult =
  | { ok: true; stage: PedidoStageId; backward: boolean }
  | { ok: false; reason: "invalid_transition" | "needs_motivo" | "forbidden"; message: string };

/** Admin ou membro do perfil Financeiro (usado pela reprovação financeira). */
async function isAdminOuFinanceiro(sb: LooseClient, userId: string): Promise<boolean> {
  const { data: adm } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adm) return true;
  const { data: perfil } = await sb
    .from("perfis")
    .select("id")
    .eq("nome", "Financeiro")
    .maybeSingle();
  if (!perfil?.id) return false;
  const { data: vinculo } = await sb
    .from("user_perfis")
    .select("user_id")
    .eq("user_id", userId)
    .eq("perfil_id", perfil.id)
    .maybeSingle();
  return !!vinculo;
}

/** Chave granular no servidor (tem_permissao já libera admin). */
async function temPermissao(sb: LooseClient, userId: string, chave: string): Promise<boolean> {
  try {
    const { data } = await sb.rpc("tem_permissao", { _user_id: userId, _chave: chave });
    return data === true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Fase 5 — Fila interna de notificações de mudança de etapa.
 * Registra o evento com evento_id determinístico (idempotente).
 * NÃO envia nada por WhatsApp — feature flag desligada.
 * -------------------------------------------------------------------------*/

/** Erro explícito quando o UPDATE não atinge nenhuma linha (tipicamente RLS). */
const NENHUMA_LINHA =
  "Nenhuma linha foi atualizada — verifique se você tem permissão para operar este pedido.";

const NOTIFY_DISPATCH_ENABLED = false; // feature flag off — apenas registra

type StageClassificacao = "informativa" | "acao_necessaria" | "alerta";

const STAGE_CLASSIFICACAO: Record<PedidoStageId, StageClassificacao> = {
  analise_financeira: "acao_necessaria",
  aguardando_pagamento: "acao_necessaria",
  programacao: "acao_necessaria",
  em_producao: "informativa",
  pronto: "acao_necessaria",
  faturado_em_rota: "informativa",
  pos_venda: "informativa",
  reprovado_financeiro: "alerta",
  cancelado: "alerta",
};

async function enqueueStageChangeNotification(
  sb: LooseClient,
  args: {
    pedido_id: string;
    from: PedidoStageId;
    to: PedidoStageId;
    history_id: string;
    history_created_at: string;
    criado_por: string | null;
  },
): Promise<void> {
  // evento_id determinístico ancorado no histórico recém-criado
  const evento_id = `${args.pedido_id}:${args.from}->${args.to}:${args.history_id}`;

  // idempotência: se já existe, não recria
  const { data: existing } = await sb
    .from("pedido_notificacoes")
    .select("id")
    .eq("evento_id", evento_id)
    .maybeSingle();
  if (existing) return;

  // resolver destinatário padrão (vendedor proprietário do pedido)
  const { data: ped } = await sb
    .from("pedidos")
    .select("number, vendedor_proprietario_id, owner_id, lead_id, leads:lead_id(company)")
    .eq("id", args.pedido_id)
    .maybeSingle();

  const destinatario_user_id =
    (ped?.vendedor_proprietario_id as string | null) ?? (ped?.owner_id as string | null) ?? null;
  const numero = (ped?.number as string | null) ?? "";
  const cliente = (ped?.leads?.company as string | null) ?? "cliente";

  const classificacao = STAGE_CLASSIFICACAO[args.to] ?? "informativa";
  const mensagem =
    `[CRM Inplastic] Pedido ${numero} (${cliente}) mudou de etapa: ` +
    `${stageLabel(args.from)} → ${stageLabel(args.to)}.`;

  try {
    await sb.from("pedido_notificacoes").insert({
      pedido_id: args.pedido_id,
      evento_id,
      etapa_anterior: args.from,
      nova_etapa: args.to,
      classificacao,
      destinatario_tipo: "vendedor_proprietario",
      destinatario_user_id,
      mensagem,
      status: "pendente",
      criado_por: args.criado_por,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // unique violation → outra chamada concorrente já registrou
    if (msg.includes("duplicate") || msg.includes("23505")) return;
    throw e;
  }

  // Envio real desativado nesta fase (doc 14 — feature flag off).
  if (NOTIFY_DISPATCH_ENABLED) {
    // reservado para ativação futura com autorização
  }
}

export const updatePedidoStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; stage: PedidoStageId; motivo?: string }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        stage: z.enum(PEDIDO_STAGE_IDS),
        motivo: z.string().trim().min(3).max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MoveStageResult> => {
    const sb: LooseClient = context.supabase;

    // Guard de movimentação: somente quem tem a chave pedidos.movimentar
    // (admin, Financeiro e Operacional Comercial). Vendedor apenas visualiza.
    const podeMovimentar = await temPermissao(sb, context.userId, PERM_PEDIDOS_MOVIMENTAR);
    if (!podeMovimentar) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Você não tem permissão para movimentar pedidos — acesso somente visualização.",
      };
    }

    // Carrega etapa atual
    const { data: current, error: loadErr } = await sb
      .from("pedidos")
      .select("id, stage")
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (loadErr) throw new Error(`Falha ao carregar pedido: ${loadErr.message}`);
    if (!current) throw new Error("Pedido não encontrado");

    const from = current.stage as PedidoStageId;
    const to = data.stage;

    if (from === to) {
      return { ok: false, reason: "invalid_transition", message: "O pedido já está nesta etapa." };
    }

    const backward = isBackward(from, to);
    if (!backward && !ALLOWED_FORWARD[from].includes(to)) {
      const permitidas = ALLOWED_FORWARD[from]
        .map((s) => PEDIDO_STAGES.find((x) => x.id === s)?.label ?? s)
        .join(", ");
      return {
        ok: false,
        reason: "invalid_transition",
        message: permitidas
          ? `Transição não permitida. A partir desta etapa só é possível avançar para: ${permitidas}. Retornos exigem motivo.`
          : "Transição não permitida a partir desta etapa.",
      };
    }

    if (backward && !data.motivo) {
      return {
        ok: false,
        reason: "needs_motivo",
        message: "Retornos de etapa exigem motivo.",
      };
    }

    // Reprovação financeira: só admin/financeiro e sempre com motivo.
    if (to === PEDIDO_STAGE_REPROVADO) {
      if (!data.motivo) {
        return {
          ok: false,
          reason: "needs_motivo",
          message: "A reprovação financeira exige motivo.",
        };
      }
      const permitido = await isAdminOuFinanceiro(sb, context.userId);
      if (!permitido) {
        return {
          ok: false,
          reason: "forbidden",
          message: "Apenas administradores ou o financeiro podem reprovar um pedido.",
        };
      }
    }

    // Bloqueio de encerramento por ocorrência aberta (doc 7.9 e 22)
    if (to === "pos_venda") {
      const { count: abertas, error: ocErr } = await sb
        .from("pedido_ocorrencias")
        .select("id", { count: "exact", head: true })
        .eq("pedido_id", data.pedido_id)
        .eq("resolvida", false);
      if (ocErr) throw new Error(`Falha ao verificar ocorrências: ${ocErr.message}`);
      if ((abertas ?? 0) > 0) {
        return {
          ok: false,
          reason: "invalid_transition",
          message:
            "Não é possível avançar para pós-venda: há ocorrência(s) em aberto. Resolva-as antes.",
        };
      }
    }

    // Atualiza etapa
    const patch: Record<string, unknown> = { stage: to };
    if (to === PEDIDO_STAGE_REPROVADO) patch.reprovacao_motivo = data.motivo ?? null;
    const { data: updRow, error: updErr } = await sb
      .from("pedidos")
      .update(patch)
      .eq("id", data.pedido_id)
      .select("id")
      .maybeSingle();
    if (updErr) throw new Error(`Falha ao atualizar etapa: ${updErr.message}`);
    if (!updRow) throw new Error(NENHUMA_LINHA);

    // Registra histórico (imutável)
    const { data: histRow, error: histErr } = await sb
      .from("pedido_stage_history")
      .insert({
        pedido_id: data.pedido_id,
        from_stage: from,
        to_stage: to,
        is_backward: backward,
        motivo: data.motivo ?? null,
        moved_by: context.userId,
      })
      .select("id, created_at")
      .maybeSingle();
    if (histErr) {
      // não reverte a etapa — histórico é auditoria; loga e segue
      console.error("[updatePedidoStage] falha ao registrar histórico:", histErr);
    }

    // Fase 5 — enfileira notificação (idempotente, sem envio real).
    if (histRow) {
      try {
        await enqueueStageChangeNotification(sb, {
          pedido_id: data.pedido_id,
          from,
          to,
          history_id: histRow.id as string,
          history_created_at: histRow.created_at as string,
          criado_por: context.userId ?? null,
        });
      } catch (e) {
        console.error("[updatePedidoStage] falha ao enfileirar notificação:", e);
      }
    }

    // Notificações na tela + automações de etapa (nunca lançam).
    {
      const { aoEntrarNaEtapa } = await import("@/lib/pedidos-fluxo.server");
      await aoEntrarNaEtapa(sb, data.pedido_id, to, { motivoReprovacao: data.motivo ?? null });
    }

    return { ok: true, stage: to, backward };
  });

export type PedidoStageHistoryRow = {
  id: string;
  from_stage: PedidoStageId | null;
  to_stage: PedidoStageId;
  is_backward: boolean;
  motivo: string | null;
  moved_by: string | null;
  moved_by_name: string | null;
  created_at: string;
};

export const listPedidoStageHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string }) =>
    z.object({ pedido_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PedidoStageHistoryRow[]> => {
    const sb: LooseClient = context.supabase;
    const { data: rows, error } = await sb
      .from("pedido_stage_history")
      .select("id, from_stage, to_stage, is_backward, motivo, moved_by, created_at")
      .eq("pedido_id", data.pedido_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);

    const rowsTyped = (rows ?? []) as Array<{
      id: string;
      from_stage: PedidoStageId | null;
      to_stage: PedidoStageId;
      is_backward: boolean;
      motivo: string | null;
      moved_by: string | null;
      created_at: string;
    }>;

    const userIds = Array.from(
      new Set(rowsTyped.map((r) => r.moved_by).filter((x): x is string => !!x)),
    );
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const sbView: LooseClient = await clienteDeExibicao(sb);
      const { data: profs } = await sbView.from("profiles").select("id, name").in("id", userIds);

      for (const p of (profs ?? []) as Array<{ id: string; name: string | null }>) {
        if (p.name) nameById.set(p.id, p.name);
      }
    }

    return rowsTyped.map((r) => ({
      id: r.id,
      from_stage: r.from_stage,
      to_stage: r.to_stage,
      is_backward: r.is_backward,
      motivo: r.motivo,
      moved_by: r.moved_by,
      moved_by_name: r.moved_by ? (nameById.get(r.moved_by) ?? null) : null,
      created_at: r.created_at,
    }));
  });

/* ============================================================================
 * Fase 4 — Campos e controles por etapa
 * (aprovação, checklist de conferência, status fiscal, ocorrências)
 * ==========================================================================*/

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  note?: string | null;
};

export type PedidoOcorrencia = {
  id: string;
  pedido_id: string;
  tipo: string;
  severidade: "baixa" | "media" | "alta" | "critica";
  descricao: string;
  stage_no_momento: PedidoStageId | null;
  resolvida: boolean;
  resolvida_em: string | null;
  resolvida_por: string | null;
  resolvida_por_nome: string | null;
  resolucao_nota: string | null;
  criada_por: string | null;
  criada_por_nome: string | null;
  created_at: string;
};

export type PedidoItemDetalhe = {
  sku: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  position: number;
};

export type PedidoParcelaDetalhe = {
  days: number;
  due_date: string | null;
  amount: number;
  percentual: number | null;
  position: number;
};

export type PedidoDetalhes = {
  id: string;
  number: string;
  stage: PedidoStageId;
  /**
   * Visão por PAPEL: quando falso, TODOS os campos monetários chegam zerados/
   * nulos do servidor (não é filtro de CSS) — total, itens, parcelas, NF e
   * histórico do cliente.
   */
  pode_ver_valores: boolean;
  total: number;

  /* Comercial (quem aprova precisa ver o que está comprando) */
  cliente_nome: string | null;
  cliente_cnpj: string | null;
  vendedor_nome: string | null;
  itens: PedidoItemDetalhe[];
  subtotal: number;
  desconto_percent: number;
  forma_pagamento: string | null;
  condicao_label: string | null;
  previsao_faturamento: string | null;
  parcelas: PedidoParcelaDetalhe[];
  tratativa_comercial: string | null;
  proposta_observacoes: string | null;
  proposta_numero_pedido_cliente: string | null;
  proposta_observacoes_pedido: string | null;
  historico_cliente: HistoricoCliente;
  aprovacao_solicitada_em: string | null;
  aprovacao_solicitada_por: string | null;
  aprovacao_solicitada_por_nome: string | null;
  aprovacao_motivo: string | null;
  aprovacao_decisao: "aprovado" | "rejeitado" | null;
  aprovacao_decidida_por: string | null;
  aprovacao_decidida_por_nome: string | null;
  aprovacao_decidida_em: string | null;
  aprovacao_observacao: string | null;
  checklist_conferencia: ChecklistItem[];
  checklist_atualizado_em: string | null;
  fiscal_status: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave: string | null;
  nf_valor: number | null;
  nf_emitida_em: string | null;
  ocorrencias: PedidoOcorrencia[];
};

const APPROVAL_FIELDS = [
  "aprovacao_solicitada_em",
  "aprovacao_solicitada_por",
  "aprovacao_motivo",
  "aprovacao_decisao",
  "aprovacao_decidida_por",
  "aprovacao_decidida_em",
  "aprovacao_observacao",
  "checklist_conferencia",
  "checklist_atualizado_em",
  "nf_serie",
  "nf_chave",
  "nf_valor",
  "nf_emitida_em",
].join(", ");

async function resolveNames(sb: LooseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const sbView: LooseClient = await clienteDeExibicao(sb);
  const { data } = await sbView.from("profiles").select("id, name").in("id", uniq);

  for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (p.name) map.set(p.id, p.name);
  }
  return map;
}

export const getPedidoDetalhes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string }) =>
    z.object({ pedido_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PedidoDetalhes> => {
    const sb: LooseClient = context.supabase;
    const { data: p, error } = await sb
      .from("pedidos")
      .select(
        `id, number, stage, total, fiscal_status, nf_numero, lead_id, proposta_id,
         vendedor_proprietario_id, owner_id, proposta_snapshot, ${APPROVAL_FIELDS}`,
      )
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar pedido: ${error.message}`);
    if (!p) throw new Error("Pedido não encontrado");

    const snapProposta = (p.proposta_snapshot?.proposta ?? {}) as Record<string, unknown>;
    const paymentTermId = (snapProposta.payment_term_id as string | null) ?? null;

    // Rótulos (empresa/CNPJ do lead) vêm do client de exibição: o pedido já foi
    // autorizado pela RLS de `pedidos` acima.
    const sbView: LooseClient = await clienteDeExibicao(sb);

    const [ocRes, itensRes, leadRes, condRes, propRes] = await Promise.all([
      sb
        .from("pedido_ocorrencias")
        .select("*")
        .eq("pedido_id", data.pedido_id)
        .order("created_at", { ascending: false }),
      sb
        .from("pedido_itens")
        .select("sku, description, quantity, unit, unit_price, position")
        .eq("pedido_id", data.pedido_id)
        .order("position", { ascending: true }),
      p.lead_id
        ? sbView.from("leads").select("id, company, cnpj").eq("id", p.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),

      paymentTermId
        ? sb.from("condicoes_pagamento").select("id, label").eq("id", paymentTermId).maybeSingle()
        : Promise.resolve({ data: null }),
      p.proposta_id
        ? sb
            .from("propostas")
            .select(
              "id, tratativa_comercial, observations, numero_pedido_cliente, observacoes_pedido",
            )
            .eq("id", p.proposta_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (ocRes.error) throw new Error(`Falha ao carregar ocorrências: ${ocRes.error.message}`);

    const oc = (ocRes.data ?? []) as PedidoOcorrencia[];
    const itens: PedidoItemDetalhe[] = ((itensRes.data ?? []) as PedidoItemDetalhe[]).map((i) => ({
      sku: i.sku,
      description: i.description,
      quantity: Number(i.quantity ?? 0),
      unit: i.unit,
      unit_price: Number(i.unit_price ?? 0),
      position: Number(i.position ?? 0),
    }));
    const subtotal = +itens.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2);

    // Parcelas do snapshot; linhas fantasma (amount 0 sem vencimento) são descartadas.
    const parcelasRaw = Array.isArray(p.proposta_snapshot?.parcelas)
      ? (p.proposta_snapshot.parcelas as Array<Record<string, unknown>>)
      : [];
    const parcelas: PedidoParcelaDetalhe[] = parcelasRaw
      .map((r) => ({
        days: Number(r.days ?? 0),
        due_date: (r.due_date as string | null) ?? null,
        amount: Number(r.amount ?? 0),
        percentual: r.percentual != null ? Number(r.percentual) : null,
        position: Number(r.position ?? 0),
      }))
      .filter((r) => r.amount > 0 || r.due_date)
      .sort((a, b) => a.position - b.position);

    const condicaoLabel =
      (condRes.data as { label?: string } | null)?.label ??
      (parcelas.length > 0
        ? descreverParcelas(
            parcelas.map((r) => ({
              dias: r.days,
              percentual: r.percentual ?? 0,
            })),
          )
        : null);

    const propostaRow = propRes.data as {
      tratativa_comercial?: string | null;
      observations?: string | null;
      numero_pedido_cliente?: string | null;
      observacoes_pedido?: string | null;
    } | null;
    const tratativa =
      propostaRow?.tratativa_comercial ??
      (snapProposta.tratativa_comercial as string | null) ??
      null;

    const lead = leadRes.data as { id: string; company: string | null; cnpj: string | null } | null;
    const historico = await carregarHistoricoCliente(sb, {
      pedidoId: p.id,
      leadId: p.lead_id ?? null,
      cnpj: lead?.cnpj ?? null,
    });

    const nameById = await resolveNames(sb, [
      p.aprovacao_solicitada_por,
      p.aprovacao_decidida_por,
      p.vendedor_proprietario_id ?? p.owner_id,
      ...oc.map((o) => o.criada_por),
      ...oc.map((o) => o.resolvida_por),
    ]);

    const rawChecklist = p.checklist_conferencia ?? [];
    const checklist: ChecklistItem[] = Array.isArray(rawChecklist)
      ? (rawChecklist as ChecklistItem[])
      : [];

    const vendedorId = p.vendedor_proprietario_id ?? p.owner_id ?? null;

    // Visão por PAPEL (não por etapa): valores só para admin/financeiro e para o
    // vendedor dono do pedido. Operacional recebe a tela sem dinheiro nenhum.
    const podeVerValores =
      vendedorId === context.userId ||
      (await isAdminOuFinanceiro(sb, context.userId)) ||
      (await temPermissao(sb, context.userId, "pedidos.aprovar_financeiro"));

    const detalhe: PedidoDetalhes = {
      id: p.id,
      number: p.number,
      stage: p.stage,
      pode_ver_valores: podeVerValores,

      total: Number(p.total ?? 0),
      cliente_nome: lead?.company ?? null,
      cliente_cnpj: lead?.cnpj ?? null,
      vendedor_nome: vendedorId ? (nameById.get(vendedorId) ?? null) : null,
      itens,
      subtotal,
      desconto_percent: Number(snapProposta.discount_percent ?? 0),
      forma_pagamento: (snapProposta.forma_pagamento as string | null) ?? null,
      condicao_label: condicaoLabel,
      previsao_faturamento: (snapProposta.previsao_faturamento as string | null) ?? null,
      parcelas,
      tratativa_comercial: tratativa,
      proposta_observacoes:
        propostaRow?.observations ?? (snapProposta.observations as string | null) ?? null,
      proposta_numero_pedido_cliente:
        propostaRow?.numero_pedido_cliente ??
        (snapProposta.numero_pedido_cliente as string | null) ??
        null,
      proposta_observacoes_pedido:
        propostaRow?.observacoes_pedido ??
        (snapProposta.observacoes_pedido as string | null) ??
        null,
      historico_cliente: historico,
      aprovacao_solicitada_em: p.aprovacao_solicitada_em,
      aprovacao_solicitada_por: p.aprovacao_solicitada_por,
      aprovacao_solicitada_por_nome: p.aprovacao_solicitada_por
        ? (nameById.get(p.aprovacao_solicitada_por) ?? null)
        : null,
      aprovacao_motivo: p.aprovacao_motivo,
      aprovacao_decisao: p.aprovacao_decisao,
      aprovacao_decidida_por: p.aprovacao_decidida_por,
      aprovacao_decidida_por_nome: p.aprovacao_decidida_por
        ? (nameById.get(p.aprovacao_decidida_por) ?? null)
        : null,
      aprovacao_decidida_em: p.aprovacao_decidida_em,
      aprovacao_observacao: p.aprovacao_observacao,
      checklist_conferencia: checklist,
      checklist_atualizado_em: p.checklist_atualizado_em,
      fiscal_status: p.fiscal_status,
      nf_numero: p.nf_numero,
      nf_serie: p.nf_serie,
      nf_chave: p.nf_chave,
      nf_valor: p.nf_valor != null ? Number(p.nf_valor) : null,
      nf_emitida_em: p.nf_emitida_em,
      ocorrencias: oc.map((o) => ({
        ...o,
        criada_por_nome: o.criada_por ? (nameById.get(o.criada_por) ?? null) : null,
        resolvida_por_nome: o.resolvida_por ? (nameById.get(o.resolvida_por) ?? null) : null,
      })),
    };

    if (!podeVerValores) return redigirValores(detalhe);
    return detalhe;
  });

/** Remove, no SERVIDOR, todo campo monetário do detalhe do pedido. */
function redigirValores(d: PedidoDetalhes): PedidoDetalhes {
  const h = d.historico_cliente;
  return {
    ...d,
    total: 0,
    subtotal: 0,
    desconto_percent: 0,
    nf_valor: null,
    itens: d.itens.map((i) => ({ ...i, unit_price: 0 })),
    parcelas: d.parcelas.map((p) => ({ ...p, amount: 0 })),
    historico_cliente: {
      ...h,
      valor_total: 0,
      recentes: h.recentes.map((r) => ({ ...r, total: 0 })),
    },
  };
}


/**
 * Histórico de compras do cliente — agrupado por CNPJ (todos os leads do mesmo
 * CNPJ), caindo para o lead_id quando não há CNPJ (resultado PARCIAL).
 * Sempre consultas por conjunto de ids: nunca N+1.
 */
async function carregarHistoricoCliente(
  sb: LooseClient,
  args: { pedidoId: string; leadId: string | null; cnpj: string | null },
): Promise<HistoricoCliente> {
  const vazio = resumoHistoricoCliente([], args.pedidoId, false);
  if (!args.leadId) return vazio;

  const digitos = soDigitos(args.cnpj);
  let leadIds = [args.leadId];
  let parcial = true;

  if (digitos.length >= 11) {
    // Compara pelas grafias possíveis do mesmo CNPJ (com e sem máscara),
    // em UMA consulta — sem varrer a tabela inteira de leads.
    const mascarado =
      digitos.length === 14
        ? `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
        : digitos;
    const grafias = Array.from(new Set([args.cnpj ?? "", digitos, mascarado].filter(Boolean)));
    const sbView: LooseClient = await clienteDeExibicao(sb);
    const { data: leadsMesmoCnpj } = await sbView
      .from("leads")
      .select("id, cnpj")
      .in("cnpj", grafias);

    const ids = ((leadsMesmoCnpj ?? []) as Array<{ id: string; cnpj: string | null }>)
      .filter((l) => soDigitos(l.cnpj) === digitos)
      .map((l) => l.id);
    if (ids.length > 0) {
      leadIds = Array.from(new Set([...ids, args.leadId]));
      parcial = false;
    }
  }

  const { data: rows } = await sb
    .from("pedidos")
    .select("id, number, created_at, total, stage")
    .in("lead_id", leadIds);

  const lista = (
    (rows ?? []) as Array<{
      id: string;
      number: string;
      created_at: string;
      total: number | null;
      stage: string;
    }>
  ).map((r) => ({ ...r, total: Number(r.total ?? 0), ocorrencias_abertas: 0 }));

  const outrosIds = lista.filter((r) => r.id !== args.pedidoId).map((r) => r.id);
  if (outrosIds.length > 0) {
    const { data: ocs } = await sb
      .from("pedido_ocorrencias")
      .select("pedido_id")
      .in("pedido_id", outrosIds)
      .eq("resolvida", false);
    const abertas = new Map<string, number>();
    for (const o of (ocs ?? []) as Array<{ pedido_id: string }>) {
      abertas.set(o.pedido_id, (abertas.get(o.pedido_id) ?? 0) + 1);
    }
    for (const r of lista) r.ocorrencias_abertas = abertas.get(r.id) ?? 0;
  }

  return resumoHistoricoCliente(lista, args.pedidoId, parcial);
}

export const solicitarAprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; motivo: string }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        motivo: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const { error } = await sb
      .from("pedidos")
      .update({
        aprovacao_solicitada_em: new Date().toISOString(),
        aprovacao_solicitada_por: context.userId,
        aprovacao_motivo: data.motivo,
        aprovacao_decisao: null,
        aprovacao_decidida_por: null,
        aprovacao_decidida_em: null,
        aprovacao_observacao: null,
      })
      .eq("id", data.pedido_id);
    if (error) throw new Error(`Falha ao solicitar aprovação: ${error.message}`);
    return { ok: true as const };
  });

export const decidirAprovacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { pedido_id: string; decisao: "aprovado" | "rejeitado"; observacao?: string }) =>
      z
        .object({
          pedido_id: z.string().uuid(),
          decisao: z.enum(["aprovado", "rejeitado"]),
          observacao: z.string().trim().max(1000).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const { data: row, error } = await sb
      .from("pedidos")
      .update({
        aprovacao_decisao: data.decisao,
        aprovacao_decidida_por: context.userId,
        aprovacao_decidida_em: new Date().toISOString(),
        aprovacao_observacao: data.observacao ?? null,
      })
      .eq("id", data.pedido_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Falha ao registrar decisão: ${error.message}`);
    if (!row) throw new Error(NENHUMA_LINHA);
    return { ok: true as const };
  });

/**
 * Reprovação financeira completa: grava a decisão, move o pedido para
 * `reprovado_financeiro`, desvincula a proposta (libera o índice único parcial
 * `pedidos_proposta_id_unique` para uma futura geração de pedido), reabre a
 * proposta/lead no funil e dispara as notificações de entrada de etapa.
 */
export const reprovarPedidoFinanceiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; motivo: string }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        motivo: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;

    const permitido = await isAdminOuFinanceiro(sb, context.userId);
    if (!permitido) {
      return {
        ok: false as const,
        reason: "forbidden" as const,
        message: "Apenas administradores ou o financeiro podem reprovar um pedido.",
      };
    }

    const { data: current, error: loadErr } = await sb
      .from("pedidos")
      .select("id, stage, proposta_id, lead_id")
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (loadErr) throw new Error(`Falha ao carregar pedido: ${loadErr.message}`);
    if (!current) throw new Error("Pedido não encontrado");
    if (current.stage !== "analise_financeira" && current.stage !== "aguardando_pagamento") {
      return {
        ok: false as const,
        reason: "invalid_transition" as const,
        message:
          "Só é possível reprovar um pedido que está em análise financeira ou aguardando pagamento.",
      };
    }

    const fromStage = current.stage as PedidoStageId;
    const propostaId = current.proposta_id as string | null;
    const leadId = current.lead_id as string | null;

    const { error: updErr } = await sb
      .from("pedidos")
      .update({
        aprovacao_decisao: "rejeitado",
        aprovacao_decidida_por: context.userId,
        aprovacao_decidida_em: new Date().toISOString(),
        aprovacao_observacao: data.motivo,
        stage: "reprovado_financeiro",
        reprovacao_motivo: data.motivo,
        proposta_id: null,
      })
      .eq("id", data.pedido_id);
    if (updErr) throw new Error(`Falha ao reprovar pedido: ${updErr.message}`);

    await sb.from("pedido_stage_history").insert({
      pedido_id: data.pedido_id,
      from_stage: fromStage,
      to_stage: "reprovado_financeiro",
      is_backward: false,
      motivo: data.motivo,
      moved_by: context.userId,
    });

    // Reabre a proposta e o lead no Funil de Vendas — a reprovação desfaz o "ganho".
    if (propostaId) {
      await sb
        .from("propostas")
        .update({ status: "enviada" })
        .eq("id", propostaId)
        .eq("status", "pedido");
    }
    if (leadId) {
      await sb.from("leads").update({ stage: "proposta" }).eq("id", leadId).eq("stage", "ganho");
    }

    const { aoEntrarNaEtapa } = await import("@/lib/pedidos-fluxo.server");
    await aoEntrarNaEtapa(sb, data.pedido_id, "reprovado_financeiro", {
      motivoReprovacao: data.motivo,
    });

    return { ok: true as const };
  });



/**
 * Devolução/cancelamento de pedido nas etapas operacionais (Liberado, Em Produção,
 * Coleta/Entrega, Faturado/Em Rota). Mesmo padrão da reprovação financeira:
 * motivo obrigatório, etapa terminal, desvinculo de `proposta_id` (libera o
 * índice único parcial `pedidos_proposta_id_unique`) preservando o snapshot,
 * reabertura da proposta/lead no funil e notificação do vendedor.
 */
export const devolverPedidoOperacional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; motivo: string }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        motivo: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;

    const podeMovimentar = await temPermissao(sb, context.userId, PERM_PEDIDOS_MOVIMENTAR);
    if (!podeMovimentar) {
      return {
        ok: false as const,
        reason: "forbidden" as const,
        message: "Você não tem permissão para devolver pedidos.",
      };
    }

    const { data: current, error: loadErr } = await sb
      .from("pedidos")
      .select("id, stage, proposta_id, lead_id")
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (loadErr) throw new Error(`Falha ao carregar pedido: ${loadErr.message}`);
    if (!current) throw new Error("Pedido não encontrado");
    if (!podeDevolverPedido(current.stage as string)) {
      return {
        ok: false as const,
        reason: "invalid_transition" as const,
        message:
          "A devolução só é possível nas etapas Liberado, Em Produção, Coleta / Entrega ou Faturado / Em Rota.",
      };
    }

    const fromStage = current.stage as PedidoStageId;
    const propostaId = current.proposta_id as string | null;
    const leadId = current.lead_id as string | null;

    const { error: updErr } = await sb
      .from("pedidos")
      .update({
        stage: PEDIDO_STAGE_CANCELADO,
        reprovacao_motivo: data.motivo,
        proposta_id: null,
      })
      .eq("id", data.pedido_id);
    if (updErr) throw new Error(`Falha ao devolver pedido: ${updErr.message}`);

    await sb.from("pedido_stage_history").insert({
      pedido_id: data.pedido_id,
      from_stage: fromStage,
      to_stage: PEDIDO_STAGE_CANCELADO,
      is_backward: false,
      motivo: data.motivo,
      moved_by: context.userId,
    });

    if (propostaId) {
      await sb
        .from("propostas")
        .update({ status: "enviada" })
        .eq("id", propostaId)
        .eq("status", "pedido");
    }
    if (leadId) {
      await sb.from("leads").update({ stage: "proposta" }).eq("id", leadId).eq("stage", "ganho");
    }

    const { aoEntrarNaEtapa } = await import("@/lib/pedidos-fluxo.server");
    await aoEntrarNaEtapa(sb, data.pedido_id, PEDIDO_STAGE_CANCELADO, {
      motivoReprovacao: data.motivo,
    });

    return { ok: true as const };
  });

export const salvarChecklistConferencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; items: ChecklistItem[] }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        items: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().trim().min(1).max(200),
              done: z.boolean(),
              note: z.string().trim().max(500).optional().nullable(),
            }),
          )
          .max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;

    // Trava do checklist (doc 7.6): "pronto para faturamento/expedição" só pode
    // ficar marcado quando todos os outros itens estiverem confirmados.
    const isProntoItem = (it: ChecklistItem) =>
      it.id === "pronto" || /pronto\s+para\s+(faturamento|expedi)/i.test(it.label);
    const pronto = data.items.find(isProntoItem);
    if (pronto?.done) {
      const outrosPendentes = data.items.filter((i) => !isProntoItem(i) && !i.done);
      if (outrosPendentes.length > 0) {
        throw new Error(
          `Marque todos os itens de conferência antes de sinalizar "pronto para faturamento/expedição". Pendente(s): ${outrosPendentes
            .map((i) => i.label)
            .join(", ")}.`,
        );
      }
    }

    const { data: row, error } = await sb
      .from("pedidos")
      .update({
        checklist_conferencia: data.items,
        checklist_atualizado_em: new Date().toISOString(),
        checklist_atualizado_por: context.userId,
      })
      .eq("id", data.pedido_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Falha ao salvar checklist: ${error.message}`);
    if (!row) throw new Error(NENHUMA_LINHA);
    return { ok: true as const };
  });

export const atualizarStatusFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      pedido_id: string;
      fiscal_status: string;
      nf_numero?: string;
      nf_serie?: string;
      nf_chave?: string;
      nf_valor?: number;
    }) =>
      z
        .object({
          pedido_id: z.string().uuid(),
          fiscal_status: z.enum(["nao_iniciado", "em_processamento", "emitida", "erro"]),
          nf_numero: z.string().trim().max(50).optional(),
          nf_serie: z.string().trim().max(20).optional(),
          nf_chave: z.string().trim().max(64).optional(),
          nf_valor: z.number().nonnegative().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;

    // Snapshot dos valores atuais para diff imutável (doc 11.2 e 16)
    const { data: before } = await sb
      .from("pedidos")
      .select("nf_numero, nf_serie, nf_chave, nf_valor")
      .eq("id", data.pedido_id)
      .maybeSingle();

    const patch: Record<string, unknown> = { fiscal_status: data.fiscal_status };
    if (data.nf_numero !== undefined) patch.nf_numero = data.nf_numero || null;
    if (data.nf_serie !== undefined) patch.nf_serie = data.nf_serie || null;
    if (data.nf_chave !== undefined) patch.nf_chave = data.nf_chave || null;
    if (data.nf_valor !== undefined) patch.nf_valor = data.nf_valor;
    if (data.fiscal_status === "emitida") patch.nf_emitida_em = new Date().toISOString();
    const { data: row, error } = await sb
      .from("pedidos")
      .update(patch)
      .eq("id", data.pedido_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Falha ao atualizar status fiscal: ${error.message}`);
    if (!row) throw new Error(NENHUMA_LINHA);

    // Auditoria fiscal imutável: uma linha por campo alterado
    const toStr = (v: unknown): string | null =>
      v === null || v === undefined || v === "" ? null : String(v);
    const diffs: Array<{
      campo: string;
      valor_anterior: string | null;
      valor_novo: string | null;
    }> = [];
    const check = (
      campo: "nf_numero" | "nf_serie" | "nf_chave" | "nf_valor",
      incoming: unknown,
    ) => {
      if (incoming === undefined) return;
      const antes = toStr(before ? (before as Record<string, unknown>)[campo] : null);
      const depois = toStr(incoming);
      if (antes !== depois) diffs.push({ campo, valor_anterior: antes, valor_novo: depois });
    };
    check("nf_numero", patch.nf_numero);
    check("nf_serie", patch.nf_serie);
    check("nf_chave", patch.nf_chave);
    check("nf_valor", patch.nf_valor);

    if (diffs.length > 0) {
      const { error: histErr } = await sb.from("pedido_fiscal_history").insert(
        diffs.map((d) => ({
          pedido_id: data.pedido_id,
          campo: d.campo,
          valor_anterior: d.valor_anterior,
          valor_novo: d.valor_novo,
          alterado_por: context.userId,
        })),
      );
      if (histErr) {
        console.error("[atualizarStatusFiscal] falha ao registrar auditoria fiscal:", histErr);
      }
    }

    return { ok: true as const };
  });

export const registrarOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      pedido_id: string;
      tipo: string;
      severidade: "baixa" | "media" | "alta" | "critica";
      descricao: string;
    }) =>
      z
        .object({
          pedido_id: z.string().uuid(),
          tipo: z.string().trim().min(1).max(60),
          severidade: z.enum(["baixa", "media", "alta", "critica"]),
          descricao: z.string().trim().min(3).max(2000),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const { data: pedidoRow } = await sb
      .from("pedidos")
      .select("stage")
      .eq("id", data.pedido_id)
      .maybeSingle();
    const { data: inserted, error } = await sb
      .from("pedido_ocorrencias")
      .insert({
        pedido_id: data.pedido_id,
        tipo: data.tipo,
        severidade: data.severidade,
        descricao: data.descricao,
        stage_no_momento: pedidoRow?.stage ?? null,
        criada_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao registrar ocorrência: ${error.message}`);
    await sb
      .from("pedidos")
      .update({ ocorrencia: `[${data.severidade}] ${data.tipo}: ${data.descricao}`.slice(0, 500) })
      .eq("id", data.pedido_id);
    return { ok: true as const, id: inserted.id as string };
  });

export const resolverOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ocorrencia_id: string; resolucao_nota?: string }) =>
    z
      .object({
        ocorrencia_id: z.string().uuid(),
        resolucao_nota: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const { data: updated, error } = await sb
      .from("pedido_ocorrencias")
      .update({
        resolvida: true,
        resolvida_em: new Date().toISOString(),
        resolvida_por: context.userId,
        resolucao_nota: data.resolucao_nota ?? null,
      })
      .eq("id", data.ocorrencia_id)
      .select("pedido_id")
      .maybeSingle();
    if (error) throw new Error(`Falha ao resolver ocorrência: ${error.message}`);
    if (!updated) throw new Error(NENHUMA_LINHA);
    const { count } = await sb
      .from("pedido_ocorrencias")
      .select("id", { count: "exact", head: true })
      .eq("pedido_id", updated.pedido_id)
      .eq("resolvida", false);
    if ((count ?? 0) === 0) {
      await sb.from("pedidos").update({ ocorrencia: null }).eq("id", updated.pedido_id);
    }
    return { ok: true as const };
  });

/* ============================================================================
 * Fase 5 (complemento) — Listagem read-only de notificações do pedido
 * ==========================================================================*/

export type PedidoNotificacaoRow = {
  id: string;
  evento_id: string;
  etapa_anterior: PedidoStageId | null;
  nova_etapa: PedidoStageId;
  classificacao: "informativa" | "acao_necessaria" | "alerta";
  status: "pendente" | "enviado" | "entregue" | "falhou" | "reprocessado";
  mensagem: string;
  criado_em: string;
  enviado_em: string | null;
};

export const listPedidoNotificacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string }) =>
    z.object({ pedido_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PedidoNotificacaoRow[]> => {
    const sb: LooseClient = context.supabase;
    const { data: rows, error } = await sb
      .from("pedido_notificacoes")
      .select(
        "id, evento_id, etapa_anterior, nova_etapa, classificacao, status, mensagem, criado_em, enviado_em",
      )
      .eq("pedido_id", data.pedido_id)
      .order("criado_em", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Falha ao listar notificações: ${error.message}`);
    return (rows ?? []) as PedidoNotificacaoRow[];
  });

/** Define a modalidade de entrega do pedido (coleta | entrega_propria). */
export const setModalidadeEntrega = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; modalidade: "coleta" | "entrega_propria" }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        modalidade: z.enum(["coleta", "entrega_propria"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const { data: row, error } = await sb
      .from("pedidos")
      .update({ modalidade_entrega: data.modalidade })
      .eq("id", data.pedido_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Falha ao atualizar modalidade: ${error.message}`);
    if (!row) throw new Error(NENHUMA_LINHA);
    return { ok: true as const };
  });
