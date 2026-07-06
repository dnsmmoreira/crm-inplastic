import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

/**
 * Envia mensagem via Z-API e registra em whatsapp_mensagens (autor='vendedor', direcao='saida').
 */
export const sendConversaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ conversaId: z.string().uuid(), message: z.string().min(1).max(4096) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;
    if (!instanceId || !token || !clientToken) {
      throw new Error("Z-API não configurado (variáveis ausentes).");
    }

    const phone = normalizePhoneBR(conversa.phone);
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, message: data.message }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Z-API send-text [${res.status}]: ${body}`);
      throw new Error(`Z-API [${res.status}]: ${body}`);
    }

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: data.message,
    });
    if (mErr) throw new Error(mErr.message);

    // Sai do modo IA se ainda estava
    await supabase
      .from("whatsapp_conversas")
      .update({ status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);

    return { ok: true };
  });

/**
 * Cria lead a partir de uma conversa sem lead vinculado.
 * Vincula o telefone (telefone_whatsapp), define owner = current user
 * e atualiza a conversa (lead_id + status='humano_atendendo').
 */
export const createLeadFromConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        company: z.string().optional(),
        contactName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, name, lead_id, last_message_preview")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");
    if (conversa.lead_id) return { leadId: conversa.lead_id };

    const phoneDigits = normalizePhoneBR(conversa.phone);
    const displayName = data.contactName?.trim() || conversa.name?.trim() || "A identificar";
    const company =
      data.company?.trim() ||
      conversa.name?.trim() ||
      `Contato WhatsApp ${conversa.phone}`;

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .insert({
        owner_id: userId,
        company,
        contact_name: displayName,
        phone: conversa.phone,
        telefone_whatsapp: phoneDigits,
        stage: "atendimento",
        source: "WhatsApp",
        origem: "whatsapp",
        tags: ["WhatsApp"],
        notes: conversa.last_message_preview
          ? `Primeira mensagem: "${conversa.last_message_preview}"`
          : "",
        last_contact: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (lErr || !lead) throw new Error(lErr?.message ?? "Falha ao criar lead.");

    await supabase
      .from("whatsapp_conversas")
      .update({ lead_id: lead.id, status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);

    // Registra interação (dispara trigger de last_interaction)
    if (conversa.last_message_preview) {
      await supabase.from("lead_interactions").insert({
        lead_id: lead.id,
        owner_id: userId,
        type: "whatsapp",
        content: conversa.last_message_preview,
      });
    }

    return { leadId: lead.id };
  });
