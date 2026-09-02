/**
 * Server functions de proposta:
 * - `getPropostaPublica`: leitura ANÔNIMA (página pública), allow-list de campos.
 * - `enviarPropostaWhatsapp`: envio real do link da proposta por WhatsApp.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { tratativaValida, MSG_TRATATIVA_OBRIGATORIA } from "@/lib/tratativa-comercial";

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

export type PropostaPublicaItem = {
  id: string;
  sku: string | null;
  ncm: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
};

export type PropostaPublicaParcela = {
  id: string;
  days: number;
  amount: number;
  percentual: number | null;
  due_date: string | null;
};

export type PropostaPublica = {
  id: string;
  number: string;
  created_at: string;
  validity_days: number | null;
  forma_pagamento: string | null;
  observations: string | null;
  cliente: { nome: string | null; contato: string | null };
  emitente: {
    brand: string | null;
    tagline: string | null;
    legal_name: string | null;
    cnpj: string | null;
    ie: string | null;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    pix: string | null;
  } | null;
  condicao: { label: string | null; notes: string | null } | null;
  itens: PropostaPublicaItem[];
  parcelas: PropostaPublicaParcela[];
  frete: { valor: number; por_conta: string | null; transportadora: string | null };
  totais: {
    subtotal: number;
    desconto_percent: number;
    desconto_valor: number;
    acrescimo_percent: number;
    acrescimo_valor: number;
    total: number;
    quantidade: number;
    itens: number;
  };
};

/** Leitura pública (sem sessão) de uma proposta — somente campos client-safe. */
export const getPropostaPublica = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<PropostaPublica | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p } = await supabaseAdmin
      .from("propostas")
      .select(
        "id, number, created_at, validity_days, discount_percent, observations, forma_pagamento, payment_term_id, emitter_id, transport, lead_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!p) return null;

    const [itensRes, parcelasRes, emitterRes, condRes, leadRes] = await Promise.all([
      supabaseAdmin
        .from("proposta_itens")
        .select("id, sku, ncm, description, unit, quantity, unit_price")
        .eq("proposta_id", p.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("proposta_parcelas")
        .select("id, days, amount, percentual, due_date")
        .eq("proposta_id", p.id)
        .order("position", { ascending: true }),
      p.emitter_id
        ? supabaseAdmin
            .from("emitters")
            .select(
              "brand, tagline, legal_name, cnpj, ie, address, phone, whatsapp, email, website, banco, agencia, conta, pix",
            )
            .eq("id", p.emitter_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      p.payment_term_id
        ? supabaseAdmin
            .from("condicoes_pagamento")
            .select("label, notes, acrescimo_percent")
            .eq("id", p.payment_term_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      p.lead_id
        ? supabaseAdmin
            .from("leads")
            .select("company, contact_name, cliente_id")
            .eq("id", p.lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const itens = (itensRes.data ?? []).map((i) => ({
      id: i.id,
      sku: i.sku ?? null,
      ncm: i.ncm ?? null,
      description: i.description ?? null,
      unit: i.unit ?? null,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
    }));

    const parcelas = (parcelasRes.data ?? []).map((r) => ({
      id: r.id,
      days: Number(r.days) || 0,
      amount: Number(r.amount) || 0,
      percentual: r.percentual === null || r.percentual === undefined ? null : Number(r.percentual),
      due_date: r.due_date ?? null,
    }));

    const lead = leadRes.data as { company?: string | null; contact_name?: string | null; cliente_id?: string | null } | null;
    let nomeCliente = lead?.company ?? null;
    if (lead?.cliente_id) {
      const { data: cli } = await supabaseAdmin
        .from("clientes")
        .select("razao_social, nome_fantasia")
        .eq("id", lead.cliente_id)
        .maybeSingle();
      nomeCliente = cli?.razao_social ?? cli?.nome_fantasia ?? nomeCliente;
    }

    const cond = condRes.data as { label?: string | null; notes?: string | null; acrescimo_percent?: number | null } | null;
    const transport = (p.transport ?? {}) as {
      freightValue?: number;
      freightPayer?: string | null;
      carrier?: string | null;
    };

    const subtotal = itens.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const descontoPct = Math.max(0, Math.min(100, Number(p.discount_percent) || 0));
    const descontoValor = +(subtotal * (descontoPct / 100)).toFixed(2);
    const aposDesconto = +(subtotal - descontoValor).toFixed(2);
    const acrescimoPct = Math.max(0, Math.min(100, Number(cond?.acrescimo_percent) || 0));
    const acrescimoValor = +(aposDesconto * (acrescimoPct / 100)).toFixed(2);
    const frete = Number(transport.freightValue) || 0;

    return {
      id: p.id,
      number: p.number,
      created_at: p.created_at,
      validity_days: p.validity_days ?? null,
      forma_pagamento: p.forma_pagamento ?? null,
      observations: p.observations ?? null,
      cliente: { nome: nomeCliente, contato: lead?.contact_name ?? null },
      emitente: (emitterRes.data as PropostaPublica["emitente"]) ?? null,
      condicao: cond ? { label: cond.label ?? null, notes: cond.notes ?? null } : null,
      itens,
      parcelas,
      frete: {
        valor: frete,
        por_conta: transport.freightPayer ?? null,
        transportadora: transport.carrier ?? null,
      },
      totais: {
        subtotal,
        desconto_percent: descontoPct,
        desconto_valor: descontoValor,
        acrescimo_percent: acrescimoPct,
        acrescimo_valor: acrescimoValor,
        total: aposDesconto + acrescimoValor + frete,
        quantidade: itens.reduce((s, i) => s + i.quantity, 0),
        itens: itens.length,
      },
    };
  });

const LINK_BASE = "https://crm.inplastic.com.br/proposta-publica";

/** Envia o link da proposta pública ao cliente por e-mail. */
export const enviarPropostaEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ propostaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { enviarPropostaEmailImpl } = await import("./propostas-email.server");
    return enviarPropostaEmailImpl(context.supabase, data.propostaId, context.userId);
  });

/** Envia o link da proposta pública ao cliente por WhatsApp (janela de 24h). */
export const enviarPropostaWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ propostaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: proposta, error: pErr } = await supabase
      .from("propostas")
      .select("id, number, lead_id, sent_at, tratativa_comercial")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (pErr || !proposta) throw new Error("Proposta não encontrada ou sem permissão.");
    if (!proposta.lead_id) throw new Error("Proposta sem lead vinculado.");
    // Gate de processo (vale para todos, inclusive admin).
    if (!tratativaValida(proposta.tratativa_comercial)) throw new Error(MSG_TRATATIVA_OBRIGATORIA);

    const { data: lead } = await supabase
      .from("leads")
      .select("id, company, contact_name, phone, telefone_whatsapp")
      .eq("id", proposta.lead_id)
      .maybeSingle();
    if (!lead) throw new Error("Lead da proposta não encontrado ou sem permissão.");

    const raw = (lead.telefone_whatsapp ?? lead.phone ?? "").trim();
    if (!raw) throw new Error("Lead sem telefone de WhatsApp cadastrado.");
    const phone = normalizePhoneBR(raw);
    if (phone.length < 12) throw new Error("Lead sem telefone de WhatsApp cadastrado.");

    const link = `${LINK_BASE}/${proposta.id}`;
    const mensagem = `Olá! Segue sua proposta comercial nº ${proposta.number}: ${link}`;

    // Conversa: reaproveita a existente ou cria (whatsapp_conversas não aceita
    // INSERT via RLS — mesmo padrão de `iniciarConversaCliente`).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existente } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    let conversaId = existente?.id ?? null;
    if (!conversaId) {
      const { data: criada, error: iErr } = await supabaseAdmin
        .from("whatsapp_conversas")
        .insert({
          phone,
          name: lead.contact_name?.trim() || lead.company?.trim() || null,
          status: "humano_atendendo",
          ia_ativa: false,
          lead_id: lead.id,
        })
        .select("id")
        .single();
      if (iErr || !criada) throw new Error(iErr?.message ?? "Falha ao iniciar conversa.");
      conversaId = criada.id;
      // A atribuição vem em UPDATE: no INSERT o trigger de notificação referencia
      // uma conversa que ainda não existe e a FK falha.
      // REGISTRAR E SEGUIR: a conversa já existe; a atribuição é secundária.
      const upAtrib = await supabaseAdmin
        .from("whatsapp_conversas")
        .update({ atribuido_para: userId })
        .eq("id", conversaId);
      if (upAtrib?.error) {
        const { registrarFalhaSegura } = await import("@/lib/guard-erros");
        await registrarFalhaSegura("propostas.enviarPropostaWhatsapp/atribuir", upAtrib.error, {
          conversa_id: conversaId,
        });
      }
    }


    const { janelaAtendimentoAberta, sendWhatsappText } = await import("./whatsapp-send.server");
    const aberta = await janelaAtendimentoAberta(phone);
    if (!aberta) {
      throw new Error(
        "Fora da janela de 24h do WhatsApp — o cliente não enviou mensagem recentemente. Abra a conversa em /conversas e envie um modelo aprovado com o link, ou aguarde o cliente escrever primeiro.",
      );
    }

    await sendWhatsappText(phone, mensagem, "enviarPropostaWhatsapp", "comercial", {
      origem: "resposta_inbound",
    });

    const { error: mErr } = await supabase.from("whatsapp_mensagens").insert({
      conversa_id: conversaId,
      direcao: "saida",
      autor: "vendedor",
      conteudo: mensagem,
      usuario_id: userId,
    });
    if (mErr) throw new Error(mErr.message);

    // `sent_at` nunca é sobrescrito (mesma regra de `setProposalStatus`).
    const patch: { status: "enviada"; sent_at?: string } = { status: "enviada" };
    if (!proposta.sent_at) patch.sent_at = new Date().toISOString();
    // REGISTRAR E SEGUIR: o WhatsApp JÁ saiu; abortar não desfaz o envio.
    const { registrarFalhaSegura } = await import("@/lib/guard-erros");
    let aviso: string | undefined;
    const upStatus = await supabase.from("propostas").update(patch).eq("id", proposta.id);
    if (upStatus?.error) {
      await registrarFalhaSegura("propostas.enviarPropostaWhatsapp/marcar-enviada", upStatus.error, {
        proposta_id: proposta.id,
      });
      aviso =
        "WhatsApp enviado, mas não foi possível marcar a proposta como enviada — atualize manualmente.";
    }

    // REGISTRAR E SEGUIR: histórico de interação, posterior ao envio.
    const insInter = await supabase.from("lead_interactions").insert({
      lead_id: lead.id,
      owner_id: userId,
      type: "whatsapp",
      content: mensagem,
    });
    if (insInter?.error) {
      await registrarFalhaSegura("propostas.enviarPropostaWhatsapp/interacao", insInter.error, {
        proposta_id: proposta.id,
        lead_id: lead.id,
      });
    }

    return { ok: true as const, aviso };
  });

/** Duplica uma proposta existente em nova proposta rascunho. */
export const duplicarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ propostaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { duplicarPropostaImpl } = await import("./propostas-duplicar.server");
    return duplicarPropostaImpl(context.supabase as never, data.propostaId, context.userId);
  });

/** Duplica um pedido em nova proposta rascunho (editável). */
export const duplicarPedidoEmProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ pedidoId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { duplicarPedidoImpl } = await import("./propostas-duplicar.server");
    return duplicarPedidoImpl(context.supabase as never, data.pedidoId, context.userId);
  });
