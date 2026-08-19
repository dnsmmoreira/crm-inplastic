/**
 * (E1) Cron de rede de segurança: envia respostas da IA cujo `responder_apos`
 * já venceu.
 * Auth: `requireXerifeCronAuth` — aceita EXCLUSIVAMENTE o header x-xerife-secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/ia-fila-envio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireXerifeCronAuth(request);
        if (denied) return denied;
        try {
          const { processarRespostasPendentes } = await import("@/lib/ia-fila.server");
          const r = await processarRespostasPendentes();
          return cronJsonResponse(r);
        } catch (e) {
          console.error("[ia-fila-envio] error:", e);
          return new Response(
            JSON.stringify({ ok: false, error: "internal_error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
