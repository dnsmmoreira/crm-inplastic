import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

/**
 * Fase 3 — Kanban de Pedidos operacional (coexiste com o Funil de Vendas).
 * Operações puramente sobre `pedidos` e `pedido_stage_history`.
 * Nada altera leads/propostas nem dispara integrações externas.
 */

import {
  PEDIDO_STAGES,
  PEDIDO_STAGE_REPROVADO,
  PEDIDO_STAGE_IDS,
  ALLOWED_FORWARD,
  isBackward,
  stageLabel,
  type PedidoStageId,
} from "@/lib/pedidos-stages";

export {
  PEDIDO_STAGES,
  PEDIDO_STAGE_REPROVADO,
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

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
          "leads:lead_id(company)",
          "propostas:proposta_id(number)",
        ].join(", "),
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id: string;
      vendedor_proprietario_id: string | null;
      responsavel_atual_id: string | null;
    }>;

    // Buscar última transição por pedido para calcular "dias na etapa"
    const ids = rows.map((r) => r.id);
    const lastChangeByPedido = new Map<string, string>();
    const openOcorrByPedido = new Map<string, number>();
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
    }

    // Resolver nomes de profiles (vendedor + responsável) via lookup separado —
    // não há FK declarada entre pedidos e profiles, então evitamos embed do PostgREST.
    const profileIds = new Set<string>();
    for (const r of rows) {
      if (r.vendedor_proprietario_id) profileIds.add(r.vendedor_proprietario_id);
      if (r.responsavel_atual_id) profileIds.add(r.responsavel_atual_id);
    }
    const nameById = new Map<string, string>();
    if (profileIds.size > 0) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, name")
        .in("id", Array.from(profileIds));
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null }>) {
        if (p.name) nameById.set(p.id, p.name);
      }
    }

    return (data ?? []).map(
      (r: {
        id: string; number: string; stage: PedidoStageId; total: number; created_at: string;
        previsao_entrega: string | null; equipe_responsavel: string | null;
        responsavel_atual_id: string | null;
        fiscal_status: string | null; nf_numero: string | null;
        forma_atendimento: string | null; prioridade: string | null; ocorrencia: string | null;
        vendedor_proprietario_id: string | null; proposta_id: string | null; lead_id: string | null;
        leads?: { company: string | null } | null;
        propostas?: { number: string | null } | null;
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
        responsavel_nome: r.responsavel_atual_id ? nameById.get(r.responsavel_atual_id) ?? null : null,
        fiscal_status: r.fiscal_status,
        nf_numero: r.nf_numero,
        forma_atendimento: r.forma_atendimento,
        prioridade: r.prioridade,
        ocorrencia: r.ocorrencia,
        ocorrencias_abertas: openOcorrByPedido.get(r.id) ?? 0,
        vendedor_proprietario_id: r.vendedor_proprietario_id,
        vendedor_nome: r.vendedor_proprietario_id ? nameById.get(r.vendedor_proprietario_id) ?? null : null,
        proposta_id: r.proposta_id,
        lead_id: r.lead_id,
        lead_company: r.leads?.company ?? null,
        proposta_number: r.propostas?.number ?? null,
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
  const { data: perfil } = await sb.from("perfis").select("id").eq("nome", "Financeiro").maybeSingle();
  if (!perfil?.id) return false;
  const { data: vinculo } = await sb
    .from("user_perfis")
    .select("user_id")
    .eq("user_id", userId)
    .eq("perfil_id", perfil.id)
    .maybeSingle();
  return !!vinculo;
}

/* ---------------------------------------------------------------------------
 * Fase 5 — Fila interna de notificações de mudança de etapa.
 * Registra o evento com evento_id determinístico (idempotente).
 * NÃO envia nada por WhatsApp — feature flag desligada.
 * -------------------------------------------------------------------------*/

const NOTIFY_DISPATCH_ENABLED = false; // feature flag off — apenas registra

type StageClassificacao = "informativa" | "acao_necessaria" | "alerta";

const STAGE_CLASSIFICACAO: Record<PedidoStageId, StageClassificacao> = {
  analise_financeira: "acao_necessaria",
  programacao: "acao_necessaria",
  em_producao: "informativa",
  pronto: "acao_necessaria",
  faturado_em_rota: "informativa",
  pos_venda: "informativa",
  reprovado_financeiro: "alerta",
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
    const { error: updErr } = await sb.from("pedidos").update(patch).eq("id", data.pedido_id);
    if (updErr) throw new Error(`Falha ao atualizar etapa: ${updErr.message}`);

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
      id: string; from_stage: PedidoStageId | null; to_stage: PedidoStageId;
      is_backward: boolean; motivo: string | null; moved_by: string | null; created_at: string;
    }>;

    const userIds = Array.from(new Set(rowsTyped.map((r) => r.moved_by).filter((x): x is string => !!x)));
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await sb.from("profiles").select("id, name").in("id", userIds);
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
      moved_by_name: r.moved_by ? nameById.get(r.moved_by) ?? null : null,
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

export type PedidoDetalhes = {
  id: string;
  number: string;
  stage: PedidoStageId;
  total: number;
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
  const { data } = await sb.from("profiles").select("id, name").in("id", uniq);
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
      .select(`id, number, stage, total, fiscal_status, nf_numero, ${APPROVAL_FIELDS}`)
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar pedido: ${error.message}`);
    if (!p) throw new Error("Pedido não encontrado");

    const { data: ocorrs, error: ocErr } = await sb
      .from("pedido_ocorrencias")
      .select("*")
      .eq("pedido_id", data.pedido_id)
      .order("created_at", { ascending: false });
    if (ocErr) throw new Error(`Falha ao carregar ocorrências: ${ocErr.message}`);

    const oc = (ocorrs ?? []) as PedidoOcorrencia[];
    const nameById = await resolveNames(sb, [
      p.aprovacao_solicitada_por,
      p.aprovacao_decidida_por,
      ...oc.map((o) => o.criada_por),
      ...oc.map((o) => o.resolvida_por),
    ]);

    const rawChecklist = p.checklist_conferencia ?? [];
    const checklist: ChecklistItem[] = Array.isArray(rawChecklist)
      ? (rawChecklist as ChecklistItem[])
      : [];

    return {
      id: p.id,
      number: p.number,
      stage: p.stage,
      total: Number(p.total ?? 0),
      aprovacao_solicitada_em: p.aprovacao_solicitada_em,
      aprovacao_solicitada_por: p.aprovacao_solicitada_por,
      aprovacao_solicitada_por_nome: p.aprovacao_solicitada_por
        ? nameById.get(p.aprovacao_solicitada_por) ?? null
        : null,
      aprovacao_motivo: p.aprovacao_motivo,
      aprovacao_decisao: p.aprovacao_decisao,
      aprovacao_decidida_por: p.aprovacao_decidida_por,
      aprovacao_decidida_por_nome: p.aprovacao_decidida_por
        ? nameById.get(p.aprovacao_decidida_por) ?? null
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
        criada_por_nome: o.criada_por ? nameById.get(o.criada_por) ?? null : null,
        resolvida_por_nome: o.resolvida_por ? nameById.get(o.resolvida_por) ?? null : null,
      })),
    };
  });

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
  .inputValidator((input: { pedido_id: string; decisao: "aprovado" | "rejeitado"; observacao?: string }) =>
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
    const { error } = await sb
      .from("pedidos")
      .update({
        aprovacao_decisao: data.decisao,
        aprovacao_decidida_por: context.userId,
        aprovacao_decidida_em: new Date().toISOString(),
        aprovacao_observacao: data.observacao ?? null,
      })
      .eq("id", data.pedido_id);
    if (error) throw new Error(`Falha ao registrar decisão: ${error.message}`);
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
      it.id === "pronto" ||
      /pronto\s+para\s+(faturamento|expedi)/i.test(it.label);
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

    const { error } = await sb
      .from("pedidos")
      .update({
        checklist_conferencia: data.items,
        checklist_atualizado_em: new Date().toISOString(),
        checklist_atualizado_por: context.userId,
      })
      .eq("id", data.pedido_id);
    if (error) throw new Error(`Falha ao salvar checklist: ${error.message}`);
    return { ok: true as const };
  });

export const atualizarStatusFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
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
    const { error } = await sb.from("pedidos").update(patch).eq("id", data.pedido_id);
    if (error) throw new Error(`Falha ao atualizar status fiscal: ${error.message}`);

    // Auditoria fiscal imutável: uma linha por campo alterado
    const toStr = (v: unknown): string | null =>
      v === null || v === undefined || v === "" ? null : String(v);
    const diffs: Array<{ campo: string; valor_anterior: string | null; valor_novo: string | null }> = [];
    const check = (campo: "nf_numero" | "nf_serie" | "nf_chave" | "nf_valor", incoming: unknown) => {
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
  .inputValidator((input: {
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
      .single();
    if (error) throw new Error(`Falha ao resolver ocorrência: ${error.message}`);
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
