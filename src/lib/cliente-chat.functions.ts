import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ConversaRow = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];

/**
 * Server functions do CHAT HUB do cliente (/cliente/$id/chat).
 * Reaproveita whatsapp_conversas / whatsapp_mensagens já existentes.
 */

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

/** Cliente + conversas dele (via leads vinculados e/ou telefone cadastrado). */
export const getClienteChatContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ clienteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: cliente, error: cErr } = await supabase
      .from("clientes")
      .select("id, razao_social, nome_fantasia, email, telefone, telefone2, cnpj, cpf, tipo_pessoa")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cliente) throw new Error("Cliente não encontrado.");

    const { data: leads } = await supabase
      .from("leads")
      .select("id, company, contact_name, email, phone, telefone_whatsapp")
      .eq("cliente_id", data.clienteId);
    const leadIds = (leads ?? []).map((l) => l.id);

    const conversas: ConversaRow[] = [];
    if (leadIds.length > 0) {
      const { data: byLead } = await supabase
        .from("whatsapp_conversas")
        .select("*")
        .in("lead_id", leadIds)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      conversas.push(...(byLead ?? []));
    }

    // Também casa por telefone cadastrado no cliente (conversa ainda sem lead).
    const fones = [cliente.telefone, cliente.telefone2]
      .map((f) => onlyDigits(f ?? ""))
      .filter((f) => f.length >= 8)
      .map((f) => f.slice(-8));
    if (fones.length > 0) {
      const { data: byPhone } = await supabase
        .from("whatsapp_conversas")
        .select("*")
        .or(fones.map((f) => `phone.ilike.%${f}`).join(","))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);
      for (const c of byPhone ?? []) {
        if (!conversas.some((x) => x.id === c.id)) conversas.push(c);
      }
    }

    return {
      cliente,
      leads: leads ?? [],
      conversas,
    };
  });

/** Mensagens paginadas (scroll-up carrega mais antigas). */
export const listMensagensPaginado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        before: z.string().optional(),
        limit: z.number().int().min(10).max(200).default(40),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("whatsapp_mensagens")
      .select("*")
      .eq("conversa_id", data.conversaId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.before) query = query.lt("created_at", data.before);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const lista = (rows ?? []).slice().reverse();
    return { mensagens: lista, hasMore: (rows ?? []).length === data.limit };
  });

/** Propostas do cliente (para o botão rápido "Enviar proposta"). */
export const listPropostasCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ clienteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("cliente_id", data.clienteId);
    const ids = (leads ?? []).map((l) => l.id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await supabase
      .from("propostas")
      .select("id, number, status, created_at, lead_id")
      .in("lead_id", ids)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Envia o link da proposta pelo canal escolhido e registra a mensagem. */
export const enviarPropostaPorCanal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        conversaId: z.string().uuid(),
        propostaId: z.string().uuid(),
        canal: z.enum(["whatsapp", "email"]),
        baseUrl: z.string().url(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: proposta, error: pErr } = await supabase
      .from("propostas")
      .select("id, number, lead_id")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (pErr || !proposta) throw new Error("Proposta não encontrada.");

    const { data: conversa, error: cErr } = await supabase
      .from("whatsapp_conversas")
      .select("id, phone, lead_id")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (cErr || !conversa) throw new Error("Conversa não encontrada ou sem permissão.");

    const link = `${data.baseUrl.replace(/\/$/, "")}/propostas/${proposta.id}`;
    const texto = `Segue a proposta comercial ${proposta.number}.\nAcesse o PDF aqui: ${link}`;

    let externalRef: string | null = null;
    if (data.canal === "email") {
      let destino: string | null = null;
      if (conversa.lead_id) {
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
      await sendEmailText(destino, `Proposta ${proposta.number}`, texto, "enviarProposta");
      externalRef = `email:${destino}`;
    } else {
      const { sendZapiText } = await import("./zapi-send.server");
      await sendZapiText(conversa.phone, texto, "enviarProposta");
    }

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: texto,
      usuario_id: userId,
      tipo: data.canal === "email" ? "email" : "texto",
      ...(externalRef ? { external_id: externalRef } : {}),
    });
    if (mErr) throw new Error(mErr.message);

    return { ok: true, link };
  });

/** Envia mensagem direta ao cliente (WhatsApp ou E-mail), sem depender de conversa. */
export const enviarMensagemDiretaCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        clienteId: z.string().uuid(),
        canal: z.enum(["whatsapp", "email"]),
        destino: z.string().min(1),
        assunto: z.string().max(200).optional(),
        message: z.string().min(1).max(4096),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cliente, error: cErr } = await supabase
      .from("clientes")
      .select("id, razao_social, telefone, telefone2, email")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (cErr || !cliente) throw new Error("Cliente não encontrado ou sem permissão.");

    if (data.canal === "email") {
      const { sendEmailText } = await import("./email-send.server");
      await sendEmailText(
        data.destino.trim(),
        data.assunto?.trim() || "Mensagem da INPLASTIC",
        data.message,
        "enviarMensagemDiretaCliente",
      );
    } else {
      const { sendZapiText } = await import("./zapi-send.server");
      await sendZapiText(data.destino, data.message, "enviarMensagemDiretaCliente");
    }

    // Se já existir conversa do cliente (via leads), registra a mensagem no histórico.
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("cliente_id", data.clienteId);
    const leadIds = (leads ?? []).map((l) => l.id);
    if (leadIds.length > 0) {
      const { data: conversa } = await supabase
        .from("whatsapp_conversas")
        .select("id")
        .in("lead_id", leadIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (conversa) {
        await supabase.from("whatsapp_mensagens").insert({
          conversa_id: conversa.id,
          direcao: "saida",
          autor: "vendedor",
          conteudo: data.message,
          usuario_id: userId,
          tipo: data.canal === "email" ? "email" : "texto",
        });
      }
    }

    return { ok: true, canal: data.canal };
  });
