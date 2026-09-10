/**
 * Reconciliação da carteira (somente leitura): sinaliza leads ativos que batem
 * com um cliente da casa e estão sem vínculo. Não reatribui nada.
 * Auth: `requireXerifeCronAuth` (header x-xerife-secret).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/carteira-reconciliacao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireXerifeCronAuth(request);
        if (denied) return denied;
        try {
          const { reconciliarCarteira } = await import("@/lib/carteira-reconciliacao.server");
          const r = await reconciliarCarteira({});
          return cronJsonResponse({
            ok: true,
            analisados: r.analisados,
            divergencias: r.divergencias.length,
            detalhe: r.divergencias.slice(0, 50),
          });
        } catch (e) {
          console.error("[carteira-reconciliacao] error:", e);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
