import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;

type QualifyBody = {
  conversa_id?: string;
  dados?: {
    empresa?: string;
    contato?: string;
    segmento?: string;
    produto?: string;
    quantidade?: number | string;
    urgencia?: string;
    cidade_uf?: string;
  };
  motivo?: string;
  distribuir?: boolean;
};

/**
 * Endpoint chamado pelo n8n para qualificar um lead a partir da conversa.
 * Header obrigatório: x-n8n-secret.
 * Body: ver QualifyBody.
 */
export const Route = createFileRoute("/api/public/hooks/ia-qualificar")({
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

        let body: QualifyBody;
        try {
          body = (await request.json()) as QualifyBody;
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const conversaId = body.conversa_id?.trim();
        if (!conversaId) {
          return new Response(JSON.stringify({ error: "conversa_id é obrigatório" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const dados = body.dados ?? {};
        const distribuir = !!body.distribuir;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: conv, error: cErr } = await supabaseAdmin
          .from("whatsapp_conversas")
          .select("id, phone, name, lead_id, last_message_preview")
          .eq("id", conversaId)
          .maybeSingle();
        if (cErr || !conv) {
          return new Response(JSON.stringify({ error: "conversa não encontrada" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let leadId = conv.lead_id as string | null;

        // 1) Cria o lead se ainda não existir
        if (!leadId) {
          const company =
            dados.empresa?.trim() ||
            conv.name?.trim() ||
            `WhatsApp ${conv.phone}`;
          const contactName = dados.contato?.trim() || conv.name?.trim() || "A identificar";
          const quantidade =
            typeof dados.quantidade === "string"
              ? Number(dados.quantidade.replace(/[^\d]/g, "")) || undefined
              : typeof dados.quantidade === "number"
                ? dados.quantidade
                : undefined;

          const notesLines: string[] = [];
          if (body.motivo) notesLines.push(`IA: ${body.motivo}`);
          if (dados.urgencia) notesLines.push(`Urgência: ${dados.urgencia}`);
          if (dados.cidade_uf) notesLines.push(`Cidade/UF: ${dados.cidade_uf}`);
          if (conv.last_message_preview)
            notesLines.push(`Última mensagem: "${conv.last_message_preview}"`);

          const { data: lead, error: lErr } = await supabaseAdmin
            .from("leads")
            .insert({
              owner_id: null,
              company,
              contact_name: contactName,
              phone: conv.phone,
              telefone_whatsapp: conv.phone,
              product: dados.produto ?? null,
              quantity: quantidade,
              segment: dados.segmento ?? null,
              stage: "novo",
              origem: "whatsapp",
              source: "WhatsApp IA",
              tags: ["WhatsApp", "IA"],
              notes: notesLines.join("\n"),
            })
            .select("id")
            .single();
          if (lErr || !lead) {
            return new Response(
              JSON.stringify({ error: lErr?.message ?? "falha ao criar lead" }),
              { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }
          leadId = lead.id;
        }

        // 2) Vincula lead à conversa + marca como qualificado e desliga IA
        await supabaseAdmin
          .from("whatsapp_conversas")
          .update({
            lead_id: leadId,
            status: "qualificado",
            ia_ativa: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversaId);

        // 3) Rede de segurança: a IA foi desligada, então a conversa NUNCA pode
        //    sair daqui sem responsável — round-robin + notificação ao vendedor.
        //    Se falhar, marca requer_humano e alerta admin/diretoria.
        const { garantirResponsavelConversa } = await import("@/lib/xerife/handoff.server");
        const atribuicao = await garantirResponsavelConversa(supabaseAdmin, {
          conversaId,
          leadId,
          contexto: `Lead qualificado pela IA${body.motivo ? ` — ${body.motivo}` : ""}`,
        });
        const vendedorId = atribuicao.vendedorId;

        await supabaseAdmin.from("lead_ai_actions").insert({
          lead_id: leadId,
          owner_id: vendedorId,
          type: "qualify",
          content: vendedorId
            ? `IA qualificou o lead. ${body.motivo ?? ""}`.trim()
            : `IA qualificou o lead — SEM vendedor disponível, aguardando humano. ${
                body.motivo ?? ""
              }`.trim(),
          metadata: {
            canal: "whatsapp",
            conversa_id: conversaId,
            dados,
            distribuido: !!vendedorId,
            distribuir_solicitado: distribuir,
            vendedor_id: vendedorId,
            erro_distribuicao: atribuicao.erro,
          },
        });

        return Response.json(
          {
            ok: true,
            lead_id: leadId,
            vendedor_id: vendedorId,
            distribuido: !!vendedorId,
            erro_distribuicao: atribuicao.erro,
          },
          { headers: CORS },
        );
      },
    },
  },
});
