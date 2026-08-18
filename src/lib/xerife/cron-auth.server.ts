/**
 * Autenticação central dos endpoints públicos acionados por cron (Xerife / fila da IA).
 *
 * Regras (P0 de segurança):
 *  • aceita EXCLUSIVAMENTE o header `x-xerife-secret` — nunca apikey, query
 *    string, publishable key ou JWT;
 *  • 503 quando o segredo do servidor está ausente ou fraco (< 32 bytes);
 *  • 401 quando o header está ausente ou incorreto;
 *  • comparação em tempo constante via Web Crypto (compatível com Workers);
 *  • nunca registra o valor do segredo em log;
 *  • deve ser chamada ANTES de qualquer import/uso de supabaseAdmin.
 */

export const XERIFE_CRON_HEADER = "x-xerife-secret";

/** Bytes efetivos de um segredo: hex puro conta como metade dos caracteres. */
export function decodedByteLength(secret: string): number {
  const s = secret.trim();
  if (s.length === 0) return 0;
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return s.length / 2;
  return new TextEncoder().encode(s).length;
}

/** Segredo aceitável: >= 32 bytes decodificados e variedade mínima de caracteres. */
export function isStrongSecret(secret: string | undefined | null): boolean {
  if (typeof secret !== "string") return false;
  const s = secret.trim();
  if (decodedByteLength(s) < 32) return false;
  const distintos = new Set(s).size;
  return distintos >= 8;
}

/** Comparação de strings em tempo constante (HMAC com chave efêmera). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [ma, mb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(ma);
  const vb = new Uint8Array(mb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

function jsonStatus(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Retorna `null` quando a chamada está autenticada, ou a `Response` de erro
 * (401/503) que o handler deve devolver imediatamente.
 */
export async function requireXerifeCronAuth(request: Request): Promise<Response | null> {
  const expected = process.env.XERIFE_SECRET;

  if (!isStrongSecret(expected)) {
    console.error("[cron-auth] XERIFE_SECRET ausente ou fraco — endpoint indisponível");
    return jsonStatus(503, "service_unavailable");
  }

  const provided = request.headers.get(XERIFE_CRON_HEADER);
  if (!provided) return jsonStatus(401, "unauthorized");

  const ok = await timingSafeEqual(provided, expected as string);
  if (!ok) return jsonStatus(401, "unauthorized");

  return null;
}

/**
 * Resposta de cron: apenas status e contadores. Descarta strings, UUIDs,
 * planos, mensagens internas e qualquer PII que o motor possa devolver.
 */
export function cronJsonResponse(result: unknown): Response {
  const safe: Record<string, number | boolean> = {};
  if (result && typeof result === "object") {
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
      else if (Array.isArray(v)) safe[`${k}_count`] = v.length;
    }
  }
  return new Response(JSON.stringify({ ok: true, ...safe }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
