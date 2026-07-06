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

        // 3) Distribui ou apenas registra a espera
        let vendedorId: string | null = null;
        if (distribuir) {
          const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
            "atribuir_proximo_vendedor",
            { _lead_id: leadId },
          );
          if (rpcErr) {
            console.error("atribuir_proximo_vendedor falhou:", rpcErr);
            return new Response(
              JSON.stringify({
                ok: true,
                lead_id: leadId,
                vendedor_id: null,
                distribuido: false,
                erro_distribuicao: rpcErr.message,
              }),
              { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }
          vendedorId = (rpcData as string) ?? null;
          await supabaseAdmin.from("lead_ai_actions").insert({
            lead_id: leadId,
            owner_id: vendedorId,
            type: "qualify",
            content: `IA qualificou o lead. ${body.motivo ?? ""}`.trim(),
            metadata: {
              canal: "whatsapp",
              conversa_id: conversaId,
              dados,
              distribuido: true,
              vendedor_id: vendedorId,
            },
          });
        } else {
          await supabaseAdmin.from("lead_ai_actions").insert({
            lead_id: leadId,
            owner_id: null,
            type: "qualify",
            content:
              `IA qualificou o lead — aguardando distribuição (fora do horário). ${
                body.motivo ?? ""
              }`.trim(),
            metadata: {
              canal: "whatsapp",
              conversa_id: conversaId,
              dados,
              distribuido: false,
              aguardando_distribuicao: true,
            },
          });
        }

        return Response.json(
          { ok: true, lead_id: leadId, vendedor_id: vendedorId, distribuido: distribuir },
          { headers: CORS },
        );
      },
    },
  },
});
