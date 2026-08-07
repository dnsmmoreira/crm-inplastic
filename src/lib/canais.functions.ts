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
    const { supabase, userId } = context;


    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const { sendZapiText } = await import("./zapi-send.server");
    await sendZapiText(conversa.phone, data.message, "sendConversaMessage");

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: data.message,
      usuario_id: userId,
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

/**
 * Inicia (ou reaproveita) uma conversa de WhatsApp a partir de um cliente.
 * Não envia nenhuma mensagem — apenas garante a linha em whatsapp_conversas.
 */
export const iniciarConversaCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ clienteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cliente, error: cErr } = await supabase
      .from("clientes")
      .select("id, razao_social, nome_fantasia, telefone, telefone2")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (cErr || !cliente) throw new Error("Cliente não encontrado ou sem permissão.");

    const raw = (cliente.telefone ?? cliente.telefone2 ?? "").trim();
    if (!raw) throw new Error("Cliente sem telefone cadastrado");

    const phone = normalizePhoneBR(raw);
    if (phone.length < 12) throw new Error("Cliente sem telefone cadastrado");

    const nome = cliente.nome_fantasia?.trim() || cliente.razao_social?.trim() || null;

    const { data: existente } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existente) return { conversaId: existente.id };

    // Lead vinculado ao cliente (se houver) para amarrar a conversa ao funil.
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("cliente_id", data.clienteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // whatsapp_conversas não aceita INSERT via RLS; usamos o client privilegiado
    // apenas depois de validar o usuário e o acesso dele ao cliente.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criada, error: iErr } = await supabaseAdmin
      .from("whatsapp_conversas")
      .insert({
        phone,
        name: nome,
        status: "humano_atendendo",
        ia_ativa: false,
        atribuido_para: userId,
        lead_id: lead?.id ?? null,
      })
      .select("id")
      .single();
    if (iErr || !criada) throw new Error(iErr?.message ?? "Falha ao iniciar conversa.");

    return { conversaId: criada.id };
  });
