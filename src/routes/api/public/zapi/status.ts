/**
 * (E3) Webhooks de observabilidade da Z-API — status de mensagem.
 * Mesma validação de token e mesmo hardening de método da rota
 * /api/public/zapi/webhook.
 */
import { createFileRoute } from "@tanstack/react-router";
import { CORS, metodoNaoPermitido, tratarEventoZapi } from "@/lib/zapi-eventos.server";

export const Route = createFileRoute("/api/public/zapi/status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => metodoNaoPermitido(),
      PUT: async () => metodoNaoPermitido(),
      PATCH: async () => metodoNaoPermitido(),
      DELETE: async () => metodoNaoPermitido(),
      HEAD: async () => metodoNaoPermitido(),
      POST: async ({ request }) => tratarEventoZapi(request, "status"),
    },
  },
});
