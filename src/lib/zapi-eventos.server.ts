/**
 * DEPRECATED - Z-API desativada.
 * (E3) Núcleo compartilhado dos webhooks de observabilidade da Z-API.
 * Mesma validação de token (query `token` ou header `x-zapi-token`) e mesmo
 * hardening de método da rota /api/public/zapi/webhook.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-zapi-token",
} as const;

/** DEPRECATED: responde 200 a qualquer metodo para evitar retry infinito. */
export function metodoNaoPermitido() {
  return new Response(JSON.stringify({ ok: true, deprecated: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function compararTempoConstante(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const tamanho = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < tamanho; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export type TipoEventoZapi = "status" | "desconectado" | "conectado";

export async function tratarEventoZapi(request: Request, tipo: TipoEventoZapi) {
  const secret = (process.env.ZAPI_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    console.error("ZAPI_WEBHOOK_SECRET ausente");
    return json(503, { ok: false });
  }

  const url = new URL(request.url);
  const tokenRecebido =
    (url.searchParams.get("token") ?? request.headers.get("x-zapi-token") ?? "").trim();
  if (!tokenRecebido || !compararTempoConstante(tokenRecebido, secret)) {
    const origem =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("origin") ??
      "desconhecida";
    console.warn(`[zapi-eventos:${tipo}] token inválido — origem=${origem}`);
    return json(401, { ok: false });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const { mascararTelefoneLog } = await import("@/lib/zapi-send.server");
  const telefone = typeof payload.phone === "string" ? payload.phone : "";
  const mascarado = telefone ? mascararTelefoneLog(telefone) : null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("zapi_eventos").insert({
      tipo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: JSON.parse(JSON.stringify(payload)) as any,
      telefone_mascarado: mascarado,
    });
  } catch (e) {
    console.error(
      `[zapi-eventos:${tipo}] falha ao gravar evento:`,
      e instanceof Error ? e.message : String(e),
    );
  }

  // DEPRECATED - Z-API desativada: apenas o registro bruto acima permanece.
  // Sem disjuntor, sem alerta interno, sem qualquer envio.
  return json(200, { ok: true, tipo, deprecated: true });
}
