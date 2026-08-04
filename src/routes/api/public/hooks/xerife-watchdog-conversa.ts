/**
 * Endpoint do Watchdog de conversa parada na IA.
 * Auth: mesmo padrão do xerife-engine (x-xerife-secret OU apikey do cron).
 * Cron: xerife-watchdog-conversa, a cada 10 min, 10-23h UTC, seg-sex.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/xerife-watchdog-conversa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.XERIFE_SECRET;
        const provided = request.headers.get("x-xerife-secret");
        const isCron = request.headers.get("apikey") === process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!isCron && (!expected || provided !== expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const dryRun = url.searchParams.get("dryRun") === "1";
          const { runWatchdogConversa } = await import("@/lib/xerife/watchdog-conversa.server");
          const result = await runWatchdogConversa({ force, dryRun });
          return Response.json({ ok: true, at: new Date().toISOString(), ...result });
        } catch (e) {
          console.error("[xerife-watchdog-conversa] error:", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
