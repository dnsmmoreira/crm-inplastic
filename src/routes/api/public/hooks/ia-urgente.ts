import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-n8n-secret",
} as const;

type UrgenteBody = {
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
};

/**
 * Endpoint chamado pelo n8n quando um lead é qualificado como URGENTE
 * fora do horário comercial. Envia mensagem via Z-API para o número da
 * diretoria (secret WHATSAPP_DIRETORIA) e registra em lead_ai_actions.
 * Header obrigatório: x-n8n-secret (validado contra N8N_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/ia-urgente")({
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

        let body: UrgenteBody;
        try {
          body = (await request.json()) as UrgenteBody;
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
        const motivo = body.motivo?.trim() ?? "";

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

        // Garante lead (cria se ainda não existe, mesma lógica do ia-qualificar)
        let leadId = conv.lead_id as string | null;
        if (!leadId) {
          const company =
            dados.empresa?.trim() || conv.name?.trim() || `WhatsApp ${conv.phone}`;
          const contactName =
            dados.contato?.trim() || conv.name?.trim() || "A identificar";
          const quantidade =
            typeof dados.quantidade === "string"
              ? Number(dados.quantidade.replace(/[^\d]/g, "")) || undefined
              : typeof dados.quantidade === "number"
                ? dados.quantidade
                : undefined;

          const notesLines: string[] = [];
          notesLines.push("IA: LEAD URGENTE (fora do horário)");
          if (motivo) notesLines.push(`Motivo: ${motivo}`);
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
              tags: ["WhatsApp", "IA", "Urgente"],
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
          await supabaseAdmin
            .from("whatsapp_conversas")
            .update({ lead_id: leadId, updated_at: new Date().toISOString() })
            .eq("id", conversaId);
        }

        // Monta a mensagem para a diretoria
        const empresa = dados.empresa?.trim() || conv.name?.trim() || "—";
        const contato = dados.contato?.trim() || conv.name?.trim() || "—";
        const produto = dados.produto?.trim() || "—";
        const quantidade =
          dados.quantidade !== undefined && dados.quantidade !== null && String(dados.quantidade).length
            ? String(dados.quantidade)
            : "";
        const texto =
          `🔴 LEAD URGENTE (fora do horário)\n` +
          `Empresa: ${empresa}\n` +
          `Contato: ${contato}\n` +
          `Precisa de: ${produto}${quantidade ? " " + quantidade : ""}\n` +
          `Urgência: ${motivo || dados.urgencia || "—"}\n` +
          `Conversa no CRM: crm.inplastic.com.br`;

        const diretoria = process.env.WHATSAPP_DIRETORIA;
        let enviado = false;
        let envioErro: string | null = null;

        if (diretoria) {
          try {
            const { sendZapiText } = await import("@/lib/zapi-send.server");
            console.log(
              `[ia-urgente] enviando alerta para diretoria (${diretoria.slice(0, 4)}****) conversa=${conversaId} lead=${leadId}`,
            );
            await sendZapiText(diretoria, texto, "ia-urgente");
            enviado = true;
            console.log(`[ia-urgente] alerta enviado com sucesso lead=${leadId}`);
          } catch (e) {
            envioErro = e instanceof Error ? e.message : String(e);
            console.error(`[ia-urgente] falha ao enviar alerta:`, envioErro);
          }
        } else {
          console.warn(
            "[ia-urgente] WHATSAPP_DIRETORIA não configurado — apenas registrando em lead_ai_actions",
          );
        }

        const descricao = enviado
          ? `Escalação URGENTE (fora do horário) enviada à diretoria via WhatsApp. ${motivo}`.trim()
          : diretoria
            ? `Escalação URGENTE (fora do horário) — falha ao enviar à diretoria: ${envioErro}. ${motivo}`.trim()
            : `Escalação URGENTE (fora do horário) — WHATSAPP_DIRETORIA não configurado. ${motivo}`.trim();

        await supabaseAdmin.from("lead_ai_actions").insert({
          lead_id: leadId,
          owner_id: null,
          type: "alerta",
          content: descricao,
          metadata: {
            canal: "whatsapp",
            conversa_id: conversaId,
            dados,
            motivo,
            escalacao: "urgente_fora_horario",
            diretoria_configurada: !!diretoria,
            enviado,
            envio_erro: envioErro,
          },
        });

        return Response.json(
          {
            ok: true,
            lead_id: leadId,
            enviado,
            diretoria_configurada: !!diretoria,
            ...(envioErro ? { envio_erro: envioErro } : {}),
          },
          { headers: CORS },
        );
      },
    },
  },
});
