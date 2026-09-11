/**
 * Movimentação de `leads.stage` FEITA PELO SISTEMA.
 *
 * Por que existe: o trigger `trg_leads_stage_lock` recusa qualquer UPDATE que
 * tire um lead de `ganho`/`perdido` quando quem escreve é o usuário autenticado
 * — a etapa só sai dessas duas pelas ações previstas (RPC `mover_etapa_lead`,
 * com `app.etapa_manual = 'on'`). Isso quebrava a devolução de pedido e a
 * reabertura de proposta recusada: o pedido voltava, a proposta reabria, mas o
 * lead ficava preso em Ganho/Perdido.
 *
 * A trava NÃO foi enfraquecida. Estas transições passam pela função de banco
 * `sistema_mover_etapa_lead` (SECURITY DEFINER, execução só para o
 * service_role), chamada aqui pelo client de serviço — depois que quem chamou
 * já validou permissão.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StageLead =
  | "atendimento"
  | "novo"
  | "qualificacao"
  | "proposta"
  | "negociacao"
  | "ganho"
  | "perdido";

export type MoverStageResultado =
  | { ok: true; alterado: boolean; stageAnterior?: string | null }
  | { ok: false; erro: string };

/**
 * Move a etapa do lead pelo caminho do sistema.
 * `de` funciona como guarda otimista: se a etapa atual for outra, nada muda
 * (mesmo efeito do antigo `.eq("stage", ...)`) e o retorno traz `alterado: false`.
 */
export async function moverStageLeadSistema(args: {
  leadId: string;
  para: StageLead;
  de?: StageLead | null;
  origem?: string;
}): Promise<MoverStageResultado> {
  const { data, error } = await supabaseAdmin.rpc("sistema_mover_etapa_lead" as never, {
    _lead_id: args.leadId,
    _stage: args.para,
    _origem: args.origem ?? "sistema",
    _de: args.de ?? null,
  } as never);
  if (error) return { ok: false, erro: error.message };
  const r = (data ?? {}) as { ok?: boolean; alterado?: boolean; stage_anterior?: string | null; motivo?: string };
  if (r.ok === false) return { ok: false, erro: r.motivo ?? "falha ao mover a etapa do lead" };
  return { ok: true, alterado: !!r.alterado, stageAnterior: r.stage_anterior ?? null };
}
