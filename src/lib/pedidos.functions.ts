import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 3 — Kanban de Pedidos operacional (coexiste com o Funil de Vendas).
 * Operações puramente sobre a tabela `pedidos`; não altera leads/propostas.
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

export type PedidoRow = {
  id: string;
  number: string;
  stage: PedidoStageId;
  total: number;
  created_at: string;
  previsao_entrega: string | null;
  equipe_responsavel: string | null;
  fiscal_status: string | null;
  nf_numero: string | null;
  vendedor_proprietario_id: string | null;
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
        "id, number, stage, total, created_at, previsao_entrega, equipe_responsavel, fiscal_status, nf_numero, vendedor_proprietario_id, proposta_id, lead_id, leads:lead_id(company), propostas:proposta_id(number)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
    return (data ?? []).map(
      (r: {
        id: string; number: string; stage: PedidoStageId; total: number; created_at: string;
        previsao_entrega: string | null; equipe_responsavel: string | null;
        fiscal_status: string | null; nf_numero: string | null;
        vendedor_proprietario_id: string | null; proposta_id: string | null; lead_id: string | null;
        leads?: { company: string | null } | null;
        propostas?: { number: string | null } | null;
      }) => ({
        id: r.id,
        number: r.number,
        stage: r.stage,
        total: Number(r.total ?? 0),
        created_at: r.created_at,
        previsao_entrega: r.previsao_entrega,
        equipe_responsavel: r.equipe_responsavel,
        fiscal_status: r.fiscal_status,
        nf_numero: r.nf_numero,
        vendedor_proprietario_id: r.vendedor_proprietario_id,
        proposta_id: r.proposta_id,
        lead_id: r.lead_id,
        lead_company: r.leads?.company ?? null,
        proposta_number: r.propostas?.number ?? null,
      }),
    );
  });

export const updatePedidoStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedido_id: string; stage: PedidoStageId }) =>
    z
      .object({
        pedido_id: z.string().uuid(),
        stage: z.enum(PEDIDO_STAGE_IDS),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb: LooseClient = context.supabase;
    const { error } = await sb
      .from("pedidos")
      .update({ stage: data.stage })
      .eq("id", data.pedido_id);
    if (error) throw new Error(`Falha ao atualizar etapa: ${error.message}`);
    return { ok: true };
  });
