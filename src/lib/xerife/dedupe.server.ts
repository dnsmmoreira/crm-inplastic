/**
 * Idempotência do Xerife.
 *
 * Toda regra que cria tarefa/alerta chama `alreadyActed(regra, leadId, janelaHoras)`
 * — se retornar true, pula. Se não, executa e chama `logAction(...)` que grava em xerife_log.
 *
 * Rodar o engine 2x seguidas nunca duplica nada, porque a segunda passagem
 * encontra o registro em xerife_log da primeira.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient<any, any, any>;

export async function alreadyActed(
  sb: SB,
  regra: string,
  leadId: string | null,
  janelaHoras = 24,
): Promise<boolean> {
  const sinceIso = new Date(Date.now() - janelaHoras * 3600 * 1000).toISOString();
  const q = sb
    .from("xerife_log")
    .select("id", { count: "exact", head: true })
    .eq("regra", regra)
    .gte("created_at", sinceIso);
  const { count } = await (leadId ? q.eq("lead_id", leadId) : q.is("lead_id", null));
  return (count ?? 0) > 0;
}

/** Existe tarefa pendente equivalente para o mesmo (leadId, tipo)? */
export async function hasOpenTask(
  sb: SB,
  leadId: string,
  tipo: string,
): Promise<boolean> {
  const { count } = await sb
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("tipo", tipo)
    .in("status", ["pendente", "adiada"]);
  return (count ?? 0) > 0;
}

export async function logAction(
  sb: SB,
  args: {
    regra: string;
    leadId?: string | null;
    clienteId?: string | null;
    vendedorId?: string | null;
    acao: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await sb.from("xerife_log").insert({
    regra: args.regra,
    lead_id: args.leadId ?? null,
    cliente_id: args.clienteId ?? null,
    vendedor_id: args.vendedorId ?? null,
    acao_tomada: args.acao,
    payload: args.payload ?? {},
  });
}
