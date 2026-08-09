/**
 * (E1) Cron de rede de segurança: envia respostas da IA cujo `responder_apos`
 * já venceu. Mesmo padrão de auth do watchdog (x-xerife-secret OU apikey).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ia-fila-envio")({
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
          const { processarRespostasPendentes } = await import("@/lib/ia-fila.server");
          const r = await processarRespostasPendentes();
          return Response.json({ ok: true, at: new Date().toISOString(), ...r });
        } catch (e) {
          console.error("[ia-fila-envio] error:", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
