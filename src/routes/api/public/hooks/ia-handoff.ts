import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;

const MOTIVOS = [
  "pos_venda",
  "rh",
  "fornecedor",
  "financeiro",
  "fora_portfolio",
  "outros",
  "encerrar",
] as const;
type Motivo = (typeof MOTIVOS)[number];

/**
 * Ferramentas "Outros Assuntos / Fora do Portifolio / Encerramento" do agente.
 * Não cria setores novos: marca a conversa para humano com o motivo, ou encerra.
 * Header obrigatório: x-n8n-secret.
 */
export const Route = createFileRoute("/api/public/hooks/ia-handoff")({
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

        let body: { conversa_id?: string; motivo?: string; observacao?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const conversaId = body.conversa_id?.trim();
        const motivo = (body.motivo?.trim() ?? "outros") as Motivo;
        const observacao = body.observacao?.trim() ?? "";
        if (!conversaId || !MOTIVOS.includes(motivo)) {
          return new Response(
            JSON.stringify({ error: "conversa_id e motivo válidos são obrigatórios" }),
            { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conv } = await supabaseAdmin
          .from("whatsapp_conversas")
          .select("id, phone, name, atribuido_para")
          .eq("id", conversaId)
          .maybeSingle();
        if (!conv) {
          return new Response(JSON.stringify({ error: "conversa não encontrada" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const agora = new Date().toISOString();

        if (motivo === "encerrar") {
          await supabaseAdmin
            .from("whatsapp_conversas")
            .update({
              status: "encerrado",
              ia_ativa: false,
              motivo_handoff: observacao ? `encerrada: ${observacao}` : "encerrada pela IA",
              updated_at: agora,
            })
            .eq("id", conversaId);
          console.warn(`[ia-handoff] conversa encerrada pela IA conversa=${conversaId}`);
          return Response.json({ ok: true, encerrada: true }, { headers: CORS });
        }

        await supabaseAdmin
          .from("whatsapp_conversas")
          .update({
            requer_humano: true,
            motivo_handoff: motivo,
            ia_ativa: false,
            status: "aguardando_humano",
            handoff_alertado_em: agora,
            handoff_realertado_em: null,
            updated_at: agora,
          })
          .eq("id", conversaId);

        const quem = conv.name?.trim() || conv.phone;
        const link = `https://crm.inplastic.com.br/conversas?c=${conversaId}`;
        const titulo = `Assunto ${motivo} aguardando atendimento — ${quem}`;
        const corpo = `📨 Conversa aguardando time humano\n\nCliente: ${quem}\nMotivo: ${motivo}\n${
          observacao ? `Obs.: ${observacao}\n` : ""
        }${link}`;

        const { notificarUsuario, alertarAdmins } = await import("@/lib/xerife/handoff.server");
        if (conv.atribuido_para) {
          await notificarUsuario(supabaseAdmin, {
            userId: conv.atribuido_para,
            tipo: "handoff_ia",
            titulo,
            conversaId,
          });
          const { notifyOwner } = await import("@/lib/xerife/notify.server");
          await notifyOwner(conv.atribuido_para, corpo);
        } else {
          await alertarAdmins(supabaseAdmin, {
            tipo: "handoff_ia",
            titulo,
            conversaId,
            mensagem: `⚠️ SEM responsável — ${corpo}`,
          });
        }

        console.warn(`[ia-handoff] handoff motivo=${motivo} conversa=${conversaId}`);
        return Response.json({ ok: true, motivo }, { headers: CORS });
      },
    },
  },
});
