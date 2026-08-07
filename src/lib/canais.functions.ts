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
 * Envia mensagem ao cliente pelo canal escolhido e registra em
 * whatsapp_mensagens (autor='vendedor', direcao='saida').
 * - canal "whatsapp": envia via Z-API (padrão, comportamento histórico).
 * - canal "email": envia via provedor de e-mail; destinatário vem de `to`,
 *   do lead vinculado ou do cliente vinculado ao lead.
 */
export const sendConversaMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        message: z.string().min(1).max(4096),
        canal: z.enum(["whatsapp", "email"]).default("whatsapp"),
        assunto: z.string().max(200).optional(),
        to: z.string().email().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, name, lead_id")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    let externalRef: string | null = null;

    if (data.canal === "email") {
      let destino = data.to ?? null;
      if (!destino && conversa.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("email, cliente_id")
          .eq("id", conversa.lead_id)
          .maybeSingle();
        destino = lead?.email ?? null;
        if (!destino && lead?.cliente_id) {
          const { data: cli } = await supabase
            .from("clientes")
            .select("email")
            .eq("id", lead.cliente_id)
            .maybeSingle();
          destino = cli?.email ?? null;
        }
      }
      if (!destino) throw new Error("Nenhum e-mail cadastrado para este cliente.");
      const { sendEmailText } = await import("./email-send.server");
      const assunto = data.assunto?.trim() || "Mensagem da INPLASTIC";
      await sendEmailText(destino, assunto, data.message, "sendConversaMessage");
      externalRef = `email:${destino}`;
    } else {
      const { sendZapiText } = await import("./zapi-send.server");
      await sendZapiText(conversa.phone, data.message, "sendConversaMessage");
    }

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: data.message,
      usuario_id: userId,
      tipo: data.canal === "email" ? "email" : "texto",
      ...(externalRef ? { external_id: externalRef } : {}),
    });

    if (mErr) throw new Error(mErr.message);

    // Sai do modo IA e assume a conversa se ainda não houver responsável
    await supabase
      .from("whatsapp_conversas")
      .update({ status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);

    await supabase
      .from("whatsapp_conversas")
      .update({ atribuido_para: userId })
      .eq("id", data.conversaId)
      .is("atribuido_para", null);


    return { ok: true, canal: data.canal };
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
