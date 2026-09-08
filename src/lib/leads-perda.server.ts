/**
 * Marcação de lead perdido pelo SERVIDOR — mesmo caminho de dados usado pelo
 * diálogo de perda (`leads.stage`, `motivo_perda`, `motivo_perda_detalhe`,
 * `perdido_em`, `recontatar_em`), para que relatório e fila de recontato
 * continuem coerentes.
 *
 * Não recusa proposta automaticamente: devolve aviso para o vendedor tratar
 * na tela da proposta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMotivoPerda, recontatoDias, type MotivoPerda } from "@/lib/motivos-perda";
import { assertNoError } from "@/lib/guard-erros";

type SB = SupabaseClient<any, any, any>;

export async function marcarLeadPerdidoServidor(
  sb: SB,
  args: { leadId: string; motivo: string; detalhe?: string | null; ownerId?: string | null },
): Promise<{ ok: true; aviso?: string }> {
  if (!isMotivoPerda(args.motivo)) throw new Error("Motivo de perda inválido.");
  const motivo = args.motivo as MotivoPerda;
  const dias = recontatoDias(motivo);
  const recontatar =
    dias === null ? null : new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

  const up = await sb
    .from("leads")
    .update({
      stage: "perdido",
      motivo_perda: motivo,
      motivo_perda_detalhe: args.detalhe?.trim() || null,
      perdido_em: new Date().toISOString(),
      recontatar_em: recontatar,
    })
    .eq("id", args.leadId);
  await assertNoError(up, "leads-perda.marcarLeadPerdidoServidor", { lead_id: args.leadId });

  const ins = await sb.from("lead_interactions").insert({
    lead_id: args.leadId,
    owner_id: args.ownerId ?? null,
    type: "note",
    content: `Lead marcado como perdido · ${motivo}${args.detalhe?.trim() ? ` — ${args.detalhe.trim()}` : ""}`,
  });
  await assertNoError(ins, "leads-perda.interacao", { lead_id: args.leadId });

  const { count, error: erroProp } = await sb
    .from("propostas")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", args.leadId)
    .in("status", ["enviada", "aguardando_aprovacao"]);
  if (erroProp) {
    const { registrarFalhaSegura } = await import("@/lib/guard-erros");
    await registrarFalhaSegura("leads-perda.propostaAberta", erroProp, { lead_id: args.leadId });
    return { ok: true };
  }
  if ((count ?? 0) > 0) {
    return { ok: true, aviso: "Há proposta enviada em aberto; recuse-a na tela da proposta." };
  }
  return { ok: true };
}
