/**
 * Endpoint do Watchdog de conversa parada na IA.
 * Auth: `requireXerifeCronAuth` — aceita EXCLUSIVAMENTE o header x-xerife-secret.
 * Cron: xerife-watchdog-conversa, a cada 10 min, 10-23h UTC, seg-sex.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/xerife-watchdog-conversa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireXerifeCronAuth(request);
        if (denied) return denied;
        try {
          const { runWatchdogConversa } = await import("@/lib/xerife/watchdog-conversa.server");
          const result = await runWatchdogConversa({ force: false, dryRun: false });
          return cronJsonResponse(result);
        } catch (e) {
          console.error("[xerife-watchdog-conversa] error:", e);
          return new Response(
            JSON.stringify({ ok: false, error: "internal_error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
