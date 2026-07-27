import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 3 — Kanban de Pedidos operacional (coexiste com o Funil de Vendas).
 * Operações puramente sobre `pedidos` e `pedido_stage_history`.
 * Nada altera leads/propostas nem dispara integrações externas.
 */

export const PEDIDO_STAGES = [
  { id: "pedido_recebido", label: "Pedido Recebido", color: "#94a3b8" },
  { id: "em_validacao", label: "Em Validação", color: "#64748b" },
  { id: "aguardando_aprovacao", label: "Aguard. Aprovação", color: "#f59e0b" },
  { id: "aprovado_programado", label: "Aprovado / Programado", color: "#6366f1" },
  { id: "em_producao", label: "Em Produção", color: "#8b5cf6" },
  { id: "separacao_conferencia", label: "Separação / Conferência", color: "#0ea5e9" },
  { id: "faturado_aguardando_coleta", label: "Faturado / Aguard. Coleta", color: "#06b6d4" },
  { id: "despachado_transporte", label: "Despachado / Transporte", color: "#14b8a6" },
  { id: "pedido_entregue", label: "Pedido Entregue", color: "#22c55e" },
  { id: "concluido", label: "Concluído", color: "#16a34a" },
] as const;

export type PedidoStageId = (typeof PEDIDO_STAGES)[number]["id"];
const PEDIDO_STAGE_IDS = PEDIDO_STAGES.map((s) => s.id) as [PedidoStageId, ...PedidoStageId[]];
const STAGE_ORDER: Record<PedidoStageId, number> = PEDIDO_STAGES.reduce(
  (acc, s, i) => {
    acc[s.id] = i;
    return acc;
  },
  {} as Record<PedidoStageId, number>,
);

/**
 * Matriz de transições FORWARD permitidas (documento seção 18).
 * Voltar (backward) para qualquer etapa anterior é permitido, mas exige motivo.
 */
export const ALLOWED_FORWARD: Record<PedidoStageId, PedidoStageId[]> = {
  pedido_recebido: ["em_validacao"],
  em_validacao: ["aguardando_aprovacao", "aprovado_programado"],
  aguardando_aprovacao: ["aprovado_programado"],
  aprovado_programado: ["em_producao", "separacao_conferencia"],
  em_producao: ["separacao_conferencia"],
  separacao_conferencia: ["faturado_aguardando_coleta"],
  faturado_aguardando_coleta: ["despachado_transporte"],
  despachado_transporte: ["pedido_entregue"],
  pedido_entregue: ["concluido"],
  concluido: [],
};

export function isBackward(from: PedidoStageId, to: PedidoStageId): boolean {
  return STAGE_ORDER[to] < STAGE_ORDER[from];
}

export function isTransitionAllowed(from: PedidoStageId, to: PedidoStageId): boolean {
  if (from === to) return false;
  if (isBackward(from, to)) return true; // permitido com motivo
  return ALLOWED_FORWARD[from].includes(to);
}

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
    if (ids.length > 0) {
      const { data: hist } = await sb
        .from("pedido_stage_history")
        .select("pedido_id, created_at")
        .in("pedido_id", ids)
        .order("created_at", { ascending: false });
      for (const h of (hist ?? []) as Array<{ pedido_id: string; created_at: string }>) {
        if (!lastChangeByPedido.has(h.pedido_id)) lastChangeByPedido.set(h.pedido_id, h.created_at);
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
  | { ok: false; reason: "invalid_transition" | "needs_motivo"; message: string };

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

    // Atualiza etapa
    const { error: updErr } = await sb
      .from("pedidos")
      .update({ stage: to })
      .eq("id", data.pedido_id);
    if (updErr) throw new Error(`Falha ao atualizar etapa: ${updErr.message}`);

    // Registra histórico (imutável)
    const { error: histErr } = await sb.from("pedido_stage_history").insert({
      pedido_id: data.pedido_id,
      from_stage: from,
      to_stage: to,
      is_backward: backward,
      motivo: data.motivo ?? null,
      moved_by: context.userId,
    });
    if (histErr) {
      // não reverte a etapa — histórico é auditoria; loga e segue
      console.error("[updatePedidoStage] falha ao registrar histórico:", histErr);
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
      .select("id, from_stage, to_stage, is_backward, motivo, moved_by, created_at, profile:moved_by(name)")
      .eq("pedido_id", data.pedido_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);
    return (rows ?? []).map(
      (r: {
        id: string; from_stage: PedidoStageId | null; to_stage: PedidoStageId;
        is_backward: boolean; motivo: string | null; moved_by: string | null; created_at: string;
        profile?: { name: string | null } | null;
      }) => ({
        id: r.id,
        from_stage: r.from_stage,
        to_stage: r.to_stage,
        is_backward: r.is_backward,
        motivo: r.motivo,
        moved_by: r.moved_by,
        moved_by_name: r.profile?.name ?? null,
        created_at: r.created_at,
      }),
    );
  });
