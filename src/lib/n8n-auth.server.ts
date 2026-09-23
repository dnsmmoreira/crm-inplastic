/**
 * Autenticação dos webhooks do n8n (`x-n8n-secret`).
 *
 * Mesmo padrão do `requireXerifeCronAuth`:
 *  • 503 quando o segredo do servidor está ausente ou fraco (configuração
 *    nossa — 5xx faz o n8n reenfileirar em vez de descartar);
 *  • 401 quando o header está ausente ou não confere;
 *  • comparação em TEMPO CONSTANTE (HMAC de 32 bytes), nunca dos bytes crus;
 *  • nunca registra o valor do segredo.
 */
import { timingSafeEqual } from "@/lib/xerife/cron-auth.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;

function recusa(status: number): Response {
  return new Response(JSON.stringify({ ok: false }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });
}

/** Devolve a Response de recusa, ou `null` quando a chamada é legítima. */
export async function requireN8nAuth(request: Request): Promise<Response | null> {
  const expected = process.env.N8N_SECRET;

  const { medirSegredo, segredoFraco } = await import("@/lib/segredo-medidor.server");
  if (!expected || segredoFraco(expected)) {
    await medirSegredo("n8n-auth.segredo_fraco", expected);
    return recusa(503);
  }

  const provided = request.headers.get("x-n8n-secret");
  if (!provided) return recusa(401);
  if (!(await timingSafeEqual(provided, expected))) return recusa(401);

  return null;
}
