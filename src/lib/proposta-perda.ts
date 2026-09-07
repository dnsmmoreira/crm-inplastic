/**
 * Lógica pura da perda por PROPOSTA.
 *
 * Perder é por proposta: o lead só cai para "perdido" quando não sobra
 * nenhuma outra proposta viva dele.
 */
import { recontatoDias, type MotivoPerda } from "@/lib/motivos-perda";

/** Status que mantêm o lead vivo no funil. */
export const STATUS_PROPOSTA_VIVA = [
  "rascunho",
  "enviada",
  "aguardando_aprovacao",
] as const;

/**
 * `outrasPropostasStatus` = status de TODAS as outras propostas do lead
 * (sem a que está sendo recusada).
 */
export function leadDeveIrParaPerdido(outrasPropostasStatus: readonly string[]): boolean {
  return !outrasPropostasStatus.some((s) =>
    (STATUS_PROPOSTA_VIVA as readonly string[]).includes(s),
  );
}

/**
 * Data (yyyy-mm-dd) do recontato sugerido, ou `null` quando o motivo
 * não pede recontato.
 */
export function dataRecontato(motivo: MotivoPerda, hoje: Date): string | null {
  const dias = recontatoDias(motivo);
  if (dias === null) return null;
  const d = new Date(hoje.getTime() + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}
