/**
 * DEPRECATED - Z-API desativada. Apenas grava o corpo bruto em `zapi_eventos`.
 * Responde 200 a qualquer metodo para evitar 405/retry infinito.
 * (E3) Webhook de observabilidade da Z-API — instância desconectada.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-zapi-token",
} as const;

function metodoNaoPermitido() {
  return new Response(JSON.stringify({ ok: true, deprecated: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/zapi/desconectado")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => metodoNaoPermitido(),
      PUT: async () => metodoNaoPermitido(),
      PATCH: async () => metodoNaoPermitido(),
      DELETE: async () => metodoNaoPermitido(),
      HEAD: async () => metodoNaoPermitido(),
      POST: async ({ request }) => {
        const { tratarEventoZapi } = await import("@/lib/zapi-eventos.server");
        return tratarEventoZapi(request, "desconectado");
      },
    },
  },
});
