/**
 * Autenticação dos webhooks do n8n (`x-n8n-secret`).
 *
 * Comparação em TEMPO CONSTANTE: strings de tamanhos diferentes não podem
 * lançar exceção nem vazar o tamanho do segredo — por isso comparamos os
 * HMACs (sempre 32 bytes) em vez dos bytes crus, exatamente como o
 * `cron-auth.server.ts` já faz para o Xerife.
 */
import { timingSafeEqual } from "@/lib/xerife/cron-auth.server";

/** `true` quando o header confere com o `N8N_SECRET` do servidor. */
export async function n8nSecretValido(request: Request): Promise<boolean> {
  const expected = process.env.N8N_SECRET;
  const provided = request.headers.get("x-n8n-secret");
  // MEDIÇÃO (não recusa): registra segredo ausente/fraco uma vez por requisição.
  const { medirSegredo } = await import("@/lib/segredo-medidor.server");
  await medirSegredo("n8n-auth.segredo_fraco", expected);
  if (!expected || !provided) return false;
  return timingSafeEqual(provided, expected);
}
