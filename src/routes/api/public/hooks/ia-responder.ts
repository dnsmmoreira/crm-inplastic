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
        const { n8nSecretValido } = await import("@/lib/n8n-auth.server");
        if (!(await n8nSecretValido(request))) {
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

        // (E4) Disjuntor aberto: a IA não envia agora — a mensagem fica na fila
        // e sai quando o disjuntor fechar (o handoff/alerta interno segue normal).
        const { envioAutomaticoPausado } = await import("@/lib/zapi-disjuntor.server");
        const pausado = await envioAutomaticoPausado();

        // (E1) Atraso humano de 20s a 90s antes de QUALQUER resposta automática.
        // A resposta é enfileirada (responder_apos) e despachada depois; respostas
        // pendentes anteriores da mesma conversa são canceladas (agregação).
        const { enfileirarRespostaIA, aguardarEDespachar } = await import("@/lib/ia-fila.server");
        let enfileirada: { id: string; atrasoMs: number; responderApos: string };
        try {
          enfileirada = await enfileirarRespostaIA(conversaId, mensagem);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ia-responder enfileirar falhou:", msg);
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        if (pausado) {
          return Response.json(
            { ok: true, agendado: true, pausado: true, responder_apos: enfileirada.responderApos },
            { headers: CORS },
          );
        }

        const r = await aguardarEDespachar(enfileirada.id, enfileirada.atrasoMs, mensagem);

        return Response.json(
          {
            ok: true,
            agendado: true,
            enviado: r.enviado,
            motivo: r.motivo ?? null,
            responder_apos: enfileirada.responderApos,
          },
          { headers: CORS },
        );
      },
    },
  },
});
