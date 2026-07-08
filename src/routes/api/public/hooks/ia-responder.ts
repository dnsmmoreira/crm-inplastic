import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;


/**
 * Endpoint chamado pelo n8n para responder ao cliente via WhatsApp.
 * Header obrigatório: x-n8n-secret (validado contra N8N_SECRET).
 * Body: { conversa_id: string, mensagem: string }
 */
export const Route = createFileRoute("/api/public/hooks/ia-responder")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const expected = process.env.N8N_SECRET;
        const provided = request.headers.get("x-n8n-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: { conversa_id?: string; mensagem?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const conversaId = body.conversa_id?.trim();
        const mensagem = body.mensagem?.trim();
        if (!conversaId || !mensagem) {
          return new Response(
            JSON.stringify({ error: "conversa_id e mensagem são obrigatórios" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conv, error: cErr } = await supabaseAdmin
          .from("whatsapp_conversas")
          .select("id, phone, ia_ativa, status")
          .eq("id", conversaId)
          .maybeSingle();
        if (cErr || !conv) {
          return new Response(JSON.stringify({ error: "conversa não encontrada" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        if (!conv.ia_ativa) {
          return new Response(
            JSON.stringify({ error: "ia_ativa=false — humano assumiu a conversa" }),
            { status: 409, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        try {
          const { sendZapiText } = await import("@/lib/zapi-send.server");
          await sendZapiText(conv.phone, mensagem, "ia-responder");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ia-responder envio Z-API falhou:", msg);
          return new Response(JSON.stringify({ error: msg }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const { error: mErr } = await supabaseAdmin.from("whatsapp_mensagens").insert({
          conversa_id: conversaId,
          direcao: "saida",
          autor: "ia",
          conteudo: mensagem,
        });
        if (mErr) {
          console.error("ia-responder insert mensagem falhou:", mErr);
        }

        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
