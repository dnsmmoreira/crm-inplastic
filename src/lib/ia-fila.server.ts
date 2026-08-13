/**
 * (E1) Fila de respostas automáticas da IA com atraso humano.
 *
 * A resposta do n8n NÃO é enviada na hora: fica em `ia_respostas_pendentes`
 * com `responder_apos` = agora + atraso (20s a 90s). O despacho tenta ocorrer
 * na própria requisição (aguardando o tempo) e, como rede de segurança, o cron
 * `/api/public/hooks/ia-fila-envio` processa o que sobrar.
 *
 * Agregação: ao enfileirar, respostas pendentes anteriores da MESMA conversa
 * são canceladas — o cliente recebe UMA resposta só.
 */
import {
  calcularAtrasoMs,
  calcularEsperaAntesDoTyping,
  calcularTypingMs,
  sleep,
} from "./zapi-humanizacao";
import { mascararTelefoneLog } from "./whatsapp-send.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function admin(): Promise<SB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function enfileirarRespostaIA(conversaId: string, mensagem: string) {
  const sb = await admin();
  const atrasoMs = calcularAtrasoMs();
  const responderApos = new Date(Date.now() + atrasoMs).toISOString();

  // Agregação: cancela respostas ainda não enviadas desta conversa.
  await sb
    .from("ia_respostas_pendentes")
    .update({ status: "cancelada", erro: "substituida por resposta mais recente" })
    .eq("conversa_id", conversaId)
    .eq("status", "pendente");

  const { data, error } = await sb
    .from("ia_respostas_pendentes")
    .insert({ conversa_id: conversaId, mensagem, responder_apos: responderApos })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { id: data.id as string, atrasoMs, responderApos };
}

/**
 * Despacha UMA resposta pendente (marca em processamento antes de enviar).
 * Retorna o motivo quando não envia.
 */
export async function despacharResposta(id: string): Promise<{ enviado: boolean; motivo?: string }> {
  const sb = await admin();

  const { data: linha } = await sb
    .from("ia_respostas_pendentes")
    .select("id, conversa_id, mensagem, status, responder_apos")
    .eq("id", id)
    .maybeSingle();
  if (!linha) return { enviado: false, motivo: "nao_encontrada" };
  if (linha.status !== "pendente") return { enviado: false, motivo: `status_${linha.status}` };

  // Agregação: se já existe pendente mais nova nesta conversa, esta morre.
  const { data: maisNova } = await sb
    .from("ia_respostas_pendentes")
    .select("id")
    .eq("conversa_id", linha.conversa_id)
    .eq("status", "pendente")
    .gt("created_at", new Date(0).toISOString())
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maisNova?.id) {
    await sb
      .from("ia_respostas_pendentes")
      .update({ status: "cancelada", erro: "agregada em resposta mais recente" })
      .eq("id", id);
    return { enviado: false, motivo: "agregada" };
  }

  // (E4) Disjuntor: pausado → não envia automático, mas nada mais é afetado.
  const { envioAutomaticoPausado } = await import("./zapi-disjuntor.server");
  if (await envioAutomaticoPausado()) {
    console.warn("[ia-fila] envio automatico pausado pelo disjuntor — resposta adiada");
    return { enviado: false, motivo: "disjuntor_aberto" };
  }

  const { data: conv } = await sb
    .from("whatsapp_conversas")
    .select("id, phone, ia_ativa")
    .eq("id", linha.conversa_id)
    .maybeSingle();
  if (!conv) return { enviado: false, motivo: "conversa_nao_encontrada" };
  if (!conv.ia_ativa) {
    await sb
      .from("ia_respostas_pendentes")
      .update({ status: "cancelada", erro: "ia_ativa=false" })
      .eq("id", id);
    return { enviado: false, motivo: "ia_desligada" };
  }

  // Reserva a linha (evita corrida entre request e cron).
  const { data: reservada } = await sb
    .from("ia_respostas_pendentes")
    .update({ status: "enviando" })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  if (!reservada) return { enviado: false, motivo: "ja_em_processamento" };

  const phone: string = conv.phone;

  // (E2) Marca como lida + digitando, sem jamais quebrar o envio.
  const { data: ultimaEntrada } = await sb
    .from("whatsapp_mensagens")
    .select("external_id")
    .eq("conversa_id", linha.conversa_id)
    .eq("direcao", "entrada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { marcarComoLida } = await import("./whatsapp-presenca.server");
  await marcarComoLida(phone, ultimaEntrada?.external_id ?? null, "ia-fila");
  const typingMs = calcularTypingMs(linha.mensagem);
  await sleep(typingMs);

  // Origem: resposta_inbound quando o cliente já escreveu nesta conversa.
  const { count: inboundCount } = await sb
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", linha.conversa_id)
    .eq("direcao", "entrada");
  const origem = (inboundCount ?? 0) > 0 ? "resposta_inbound" : "iniciado_sistema";

  try {
    const { sendWhatsappText } = await import("./whatsapp-send.server");
    await sendWhatsappText(phone, linha.mensagem, "ia-responder", "comercial", { origem });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ia-fila] envio falhou phone=${mascararTelefoneLog(phone)}: ${msg}`);
    await sb
      .from("ia_respostas_pendentes")
      .update({ status: "erro", erro: msg.slice(0, 500) })
      .eq("id", id);
    const { registrarFalhaEntrega } = await import("./zapi-disjuntor.server");
    await sb.from("zapi_eventos").insert({
      tipo: "falha_entrega",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { origem: "ia-fila", erro: msg.slice(0, 500) } as any,
      telefone_mascarado: mascararTelefoneLog(phone),
    });
    await registrarFalhaEntrega(msg);
    return { enviado: false, motivo: "erro_envio" };
  }


  await sb.from("whatsapp_mensagens").insert({
    conversa_id: linha.conversa_id,
    direcao: "saida",
    autor: "ia",
    conteudo: linha.mensagem,
  });

  await sb
    .from("ia_respostas_pendentes")
    .update({ status: "enviada", enviado_em: new Date().toISOString() })
    .eq("id", id);

  return { enviado: true };
}

/** Espera o tempo humano restante e despacha. Usado no request do n8n. */
export async function aguardarEDespachar(id: string, atrasoMs: number, mensagem: string) {
  const typingMs = calcularTypingMs(mensagem);
  await sleep(calcularEsperaAntesDoTyping(atrasoMs, typingMs));
  return despacharResposta(id);
}

/** Rede de segurança: processa pendências vencidas (cron). */
export async function processarRespostasPendentes(limite = 10) {
  const sb = await admin();
  const { data } = await sb
    .from("ia_respostas_pendentes")
    .select("id")
    .eq("status", "pendente")
    .lte("responder_apos", new Date().toISOString())
    .order("responder_apos", { ascending: true })
    .limit(limite);

  const resultados: Array<{ id: string; enviado: boolean; motivo?: string }> = [];
  for (const l of data ?? []) {
    const r = await despacharResposta(l.id as string);
    resultados.push({ id: l.id as string, ...r });
  }
  return { processadas: resultados.length, resultados };
}
