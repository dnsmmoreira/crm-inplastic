import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

type ZapiPayload = Record<string, unknown> & {
  type?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  senderName?: string;
  chatName?: string;
  text?: { message?: string };
  message?: string;
};

/**
 * Webhook público chamado pelo Z-API quando chegam mensagens.
 * Configure no painel Z-API em: Webhooks → Ao receber → URL deste endpoint.
 */
export const Route = createFileRoute("/api/public/zapi/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as ZapiPayload;

          // Ignora mensagens enviadas por nós mesmos e mensagens de grupo
          if (payload.fromMe || payload.isGroup) {
            return Response.json({ ok: true, ignored: true }, { headers: CORS });
          }

          const phoneRaw = payload.phone ?? "";
          const phone = onlyDigits(phoneRaw);
          const message =
            payload.text?.message ??
            payload.message ??
            "";

          if (!phone || !message) {
            return Response.json({ ok: true, skipped: "no-text" }, { headers: CORS });
          }

          const name = payload.senderName || payload.chatName || null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rawJson = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
          const { error } = await supabaseAdmin.from("zapi_inbox").insert({
            phone,
            name,
            message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            raw: rawJson as any,
          });
          if (error) {
            console.error("zapi_inbox insert failed:", error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          return Response.json({ ok: true }, { headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("zapi webhook error:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
