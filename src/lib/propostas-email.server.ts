/**
 * Envio da proposta por e-mail (link da página pública), usando o e-mail
 * nativo da plataforma. Mesma regra de `sent_at` do envio por WhatsApp.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tratativaValida, MSG_TRATATIVA_OBRIGATORIA } from "@/lib/tratativa-comercial";


const LINK_BASE = "https://crm.inplastic.com.br/proposta-publica";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function emailValido(e: string | null | undefined) {
  const v = String(e ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
}

export async function enviarPropostaEmailImpl(
  supabase: SupabaseClient,
  propostaId: string,
  userId: string,
) {
  const { data: proposta, error: pErr } = await supabase
    .from("propostas")
    .select(
      "id, number, lead_id, sent_at, validity_days, discount_percent, payment_term_id, emitter_id, transport, tratativa_comercial",
    )
    .eq("id", propostaId)
    .maybeSingle();
  if (pErr || !proposta) throw new Error("Proposta não encontrada ou sem permissão.");
  if (!proposta.lead_id) throw new Error("Proposta sem lead vinculado.");
  // Gate de processo (vale para todos, inclusive admin).
  if (!tratativaValida(proposta.tratativa_comercial)) throw new Error(MSG_TRATATIVA_OBRIGATORIA);

  const { data: lead } = await supabase
    .from("leads")
    .select("id, company, contact_name, email, cliente_id")
    .eq("id", proposta.lead_id)
    .maybeSingle();
  if (!lead) throw new Error("Lead da proposta não encontrado ou sem permissão.");

  let destinatario = emailValido(lead.email);
  let nomeCliente = lead.company ?? null;
  if (lead.cliente_id) {
    const { data: cli } = await supabase
      .from("clientes")
      .select("email, razao_social, nome_fantasia")
      .eq("id", lead.cliente_id)
      .maybeSingle();
    if (!destinatario) destinatario = emailValido(cli?.email);
    nomeCliente = cli?.razao_social ?? cli?.nome_fantasia ?? nomeCliente;
  }
  if (!destinatario) {
    throw new Error(
      "Cliente sem e-mail cadastrado. Preencha o e-mail no lead ou no cadastro do cliente antes de enviar.",
    );
  }

  // Totais (mesma regra da página pública).
  const [itensRes, condRes, emitterRes, vendedorRes] = await Promise.all([
    supabase.from("proposta_itens").select("quantity, unit_price").eq("proposta_id", proposta.id),
    proposta.payment_term_id
      ? supabase
          .from("condicoes_pagamento")
          .select("acrescimo_percent")
          .eq("id", proposta.payment_term_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    proposta.emitter_id
      ? supabase.from("emitters").select("brand, legal_name").eq("id", proposta.emitter_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);

  const subtotal = (itensRes.data ?? []).reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  const descontoPct = Math.max(0, Math.min(100, Number(proposta.discount_percent) || 0));
  const aposDesconto = subtotal - subtotal * (descontoPct / 100);
  const acrescimoPct = Math.max(
    0,
    Math.min(100, Number((condRes.data as { acrescimo_percent?: number } | null)?.acrescimo_percent) || 0),
  );
  const transport = (proposta.transport ?? {}) as { freightValue?: number };
  const total = aposDesconto + aposDesconto * (acrescimoPct / 100) + (Number(transport.freightValue) || 0);

  const emitente =
    (emitterRes.data as { brand?: string; legal_name?: string } | null)?.brand ??
    (emitterRes.data as { legal_name?: string } | null)?.legal_name ??
    "Inplastic";

  const link = `${LINK_BASE}/${proposta.id}`;
  const dados = {
    numero: String(proposta.number ?? ""),
    cliente: nomeCliente ?? "Cliente",
    contato: lead.contact_name ?? "",
    total: brl(total),
    validade: proposta.validity_days ? `${proposta.validity_days} dias` : "",
    link,
    vendedor: (vendedorRes.data as { name?: string } | null)?.name ?? "",
    emitente,
  };

  const { sendResendEmail, propostaEmailHtml, propostaEmailText } = await import("./resend-send.server");
  await sendResendEmail({
    to: destinatario,
    subject: `Proposta comercial nº ${dados.numero} — ${dados.emitente}`,
    html: propostaEmailHtml(dados),
    text: propostaEmailText(dados),
  });


  const patch: { status: "enviada"; sent_at?: string } = { status: "enviada" };
  if (!proposta.sent_at) patch.sent_at = new Date().toISOString();
  // REGISTRAR E SEGUIR: o e-mail JÁ saiu; abortar não desfaz o envio.
  const { registrarFalhaSegura } = await import("./guard-erros");
  let aviso: string | undefined;
  const upStatus = await supabase.from("propostas").update(patch).eq("id", proposta.id);
  if (upStatus?.error) {
    await registrarFalhaSegura("propostas-email/marcar-enviada", upStatus.error, {
      proposta_id: proposta.id,
    });
    aviso =
      "E-mail enviado, mas não foi possível marcar a proposta como enviada — atualize manualmente.";
  }

  // REGISTRAR E SEGUIR: histórico de interação, posterior ao envio.
  const insInter = await supabase.from("lead_interactions").insert({
    lead_id: lead.id,
    owner_id: userId,
    type: "email",
    content: `Proposta nº ${proposta.number} enviada por e-mail para ${destinatario}: ${link}`,
  });
  if (insInter?.error) {
    await registrarFalhaSegura("propostas-email/interacao", insInter.error, {
      proposta_id: proposta.id,
      lead_id: lead.id,
    });
  }

  return { ok: true as const, email: destinatario, aviso };
}
