/**
 * (E3) Webhook de observabilidade da Z-API — status de mensagem.
 * Mesma validação de token e mesmo hardening de método da rota
 * /api/public/zapi/webhook.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-zapi-token",
} as const;

function metodoNaoPermitido() {
  return new Response(JSON.stringify({ ok: false }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/zapi/status")({
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
        return tratarEventoZapi(request, "status");
      },
    },
  },
});
