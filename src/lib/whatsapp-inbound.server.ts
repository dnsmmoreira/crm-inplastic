/**
 * Pipeline de entrada de mensagens de WhatsApp — ÚNICO caminho de regra de
 * negócio para mensagem recebida, compartilhado entre:
 *   - webhook Z-API (`/api/public/zapi/webhook`)
 *   - webhook WhatsApp Cloud API da Meta (`/api/public/hooks/whatsapp-cloud`)
 *
 * O comportamento aqui é exatamente o que já existia inline no webhook da
 * Z-API: guarda de duplicidade, upsert de conversa, gravação da mensagem,
 * opt-out, handoff de mídia e aviso ao n8n. Nada foi alterado.
 */

import type { MensagemTipo } from "@/lib/zapi-normalize";

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

/** Mascara telefone para logs: apenas os 4 ultimos digitos (ex.: ****7690). */
function mascararTelefoneLog(s: string) {
  const d = onlyDigits(s);
  return d ? `****${d.slice(-4)}` : "****";
}

export type EntradaWhatsapp = {
  phone: string;
  message: string;
  name: string | null;
  externalId: string | null;
  tipo: MensagemTipo;
  midia: unknown | null;
  /** Prefixo de log, ex.: "zapi-webhook" ou "wa-cloud-webhook". */
  tag: string;
  /**
   * Só grava a mensagem e atualiza a conversa: sem IA/fila, sem handoff,
   * sem notificação e sem alerta (reações e reprocessamento de backlog).
   */
  silencioso?: boolean;
  /** Data original da mensagem (reprocessamento). Padrão: agora. */
  criadoEm?: string;
};


/**
 * Gatilhos de opt-out (lista inalterada). A correspondência é por PALAVRA
 * INTEIRA no início da mensagem e só vale para mensagens curtas — antes era
 * `startsWith` solto, o que fazia "parece que..." casar com "pare".
 */
const GATILHOS_OPTOUT = ["sair", "parar", "pare", "descadastrar", "nao quero", "me tira"];
const MAX_PALAVRAS_OPTOUT = 6;

/** Recebe o texto JÁ normalizado (minúsculas, sem acentos). */
export function ehPedidoDeOptout(textoNormalizado: string) {
  const txt = String(textoNormalizado ?? "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  if (!txt) return false;
  const palavras = txt.split(/\s+/).length;
  if (palavras > MAX_PALAVRAS_OPTOUT) return false;
  return GATILHOS_OPTOUT.some((g) => new RegExp(`^${g}\\b`).test(txt));
}

export type ResultadoEntrada = Record<string, unknown>;

export async function processarEntradaWhatsapp(
  entrada: EntradaWhatsapp,
): Promise<ResultadoEntrada> {
  const { phone, message, name, externalId, tipo, midia, tag, silencioso, criadoEm } = entrada;

  const { TIPOS_COM_RESPOSTA_AUTOMATICA, TIPOS_COM_HANDOFF } = await import("@/lib/zapi-normalize");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 2) Guarda de duplicidade (reentrega).
  if (externalId) {
    const { data: jaExiste } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (jaExiste?.id) {
      console.warn(`[${tag}] mensagem duplicada ignorada:`, externalId);
      return { ok: true, duplicado: true };
    }
  } else {
    console.warn(`[${tag}] payload sem messageId — seguindo sem guarda de duplicidade`);
  }

  if (!phone || !message) {
    return { ok: true, skipped: "no-text" };
  }

  // 4) Upsert conversa por telefone
  //    Se já existe → mantém status/ia_ativa/lead_id atuais.
  //    Se não existe → cria em 'ia_atendendo' com ia_ativa=true.
  let conversaId: string | null = null;
  {
    const { candidatosTelefoneBR } = await import("@/lib/telefone-br");
    const { data: encontradas } = await supabaseAdmin
      .from("whatsapp_conversas")
      .select("id")
      .in("phone", candidatosTelefoneBR(phone))
      .order("updated_at", { ascending: false })
      .limit(1);
    const existing = encontradas?.[0] ?? null;

    if (existing?.id) {
      conversaId = existing.id;
      if (name) {
        // REGISTRAR E SEGUIR: preencher o nome é enriquecimento; abortar o
        // webhook por isso perderia a mensagem recebida.
        const upName = await supabaseAdmin
          .from("whatsapp_conversas")
          .update({ name })
          .eq("id", conversaId)
          .is("name", null);
        if (upName?.error) {
          const { registrarFalhaSegura } = await import("@/lib/guard-erros");
          await registrarFalhaSegura("whatsapp-inbound/nome-conversa", upName.error, {
            conversa_id: conversaId,
          });
        }
      }
    } else {
      const { data: leadMatch } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("telefone_whatsapp", phone)
        .maybeSingle();

      const { data: novo, error: novoErr } = await supabaseAdmin
        .from("whatsapp_conversas")
        .insert({
          phone,
          name,
          lead_id: leadMatch?.id ?? null,
          status: "ia_atendendo",
          ia_ativa: true,
        })
        .select("id")
        .single();
      if (novoErr) {
        console.error("whatsapp_conversas insert failed:", novoErr);
      }
      conversaId = novo?.id ?? null;
    }
  }

  if (!conversaId) return { ok: true, conversaId: null };

  // 5) Grava a mensagem do cliente
  {
    const { error: msgErr } = await supabaseAdmin.from("whatsapp_mensagens").insert({
      conversa_id: conversaId,
      direcao: "entrada",
      autor: "cliente",
      conteudo: message,
      external_id: externalId,
      tipo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      midia: (midia ?? null) as any,
    });
    if (msgErr) {
      // 23505 = violação de unicidade no índice parcial → reentrega, não erro.
      if (msgErr.code === "23505") {
        console.warn(`[${tag}] corrida de reentrega detectada (23505):`, externalId);
        return { ok: true, duplicado: true };
      }
      console.error("whatsapp_mensagens insert failed:", msgErr);
    }
  }

  // 5-espera) Retomada automática: mensagem do cliente encerra a espera.
  // REGISTRAR E SEGUIR: a mensagem já foi gravada; sair da espera é estado
  // derivado e pode ser reconciliado pelo Xerife.
  {
    const saiuDaEspera = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({ em_espera_desde: null, em_espera_por: null, espera_alertada_em: null })
      .eq("id", conversaId)
      .not("em_espera_desde", "is", null);
    if (saiuDaEspera?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("whatsapp-inbound/sair-da-espera", saiuDaEspera.error, {
        conversa_id: conversaId,
      });
    }
  }



  // 5a) Opt-out pedido pelo contato ("sair", "parar", ...).
  {
    const { normalizarTexto } = await import("@/lib/whatsapp-send.server");
    if (ehPedidoDeOptout(normalizarTexto(message))) {
      const { error: ooErr } = await supabaseAdmin
        .from("whatsapp_optout")
        .upsert({ phone, motivo: "pedido do contato" }, { onConflict: "phone" });
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      if (ooErr) {
        console.error("optout upsert failed:", ooErr);
        await registrarFalhaSegura("whatsapp-inbound/optout-upsert", ooErr, {
          conversa_id: conversaId,
        });
      }
      // REGISTRAR E SEGUIR (gravidade alta): webhook da Meta responde 200
      // sempre — lançar só faria a Meta reentregar. Como é compliance,
      // tentamos uma segunda vez antes de registrar a falha.
      let desligar = await supabaseAdmin
        .from("whatsapp_conversas")
        .update({ ia_ativa: false })
        .eq("id", conversaId);
      if (desligar?.error) {
        desligar = await supabaseAdmin
          .from("whatsapp_conversas")
          .update({ ia_ativa: false })
          .eq("id", conversaId);
      }
      if (desligar?.error) {
        await registrarFalhaSegura("whatsapp-inbound/optout-desligar-ia", desligar.error, {
          conversa_id: conversaId,
          gravidade: "alta",
          compliance: "opt-out não aplicado na conversa",
        });
      }
      console.warn(`[${tag}] OPT-OUT registrado phone=${mascararTelefoneLog(phone)}`);
      return { ok: true, conversaId, optout: true };
    }
  }

  // 5b) Handoff humano para mídia/tipos não conversáveis.
  if (TIPOS_COM_HANDOFF.includes(tipo)) {
    const agoraIso = new Date().toISOString();
    const { error: hoErr } = await supabaseAdmin
      .from("whatsapp_conversas")
      .update({
        requer_humano: true,
        motivo_handoff: `midia_${tipo}`,
        ia_ativa: true,
        status: "aguardando_humano",
        handoff_alertado_em: agoraIso,
        handoff_realertado_em: null,
      })
      .eq("id", conversaId)
      .in("status", ["ia_atendendo", "aguardando_humano"]);
    if (hoErr) console.error("handoff update failed:", hoErr);

    const { data: convHo } = await supabaseAdmin
      .from("whatsapp_conversas")
      .select("id, phone, name, atribuido_para, lead_id")
      .eq("id", conversaId)
      .maybeSingle();
    const quem = convHo?.name?.trim() || convHo?.phone || phone;
    const link = `https://crm.inplastic.com.br/conversas?c=${conversaId}`;
    const titulo = `Mídia (${tipo}) aguardando atendimento — ${quem}`;
    const corpo =
      `📎 Conversa aguardando especialista\n\n` +
      `Cliente: ${quem}\nMotivo: midia_${tipo}\n${link}`;
    const { notificarUsuario, alertarAdmins } = await import("@/lib/xerife/handoff.server");
    if (convHo?.atribuido_para) {
      await notificarUsuario(supabaseAdmin, {
        userId: convHo.atribuido_para,
        tipo: "handoff_midia",
        titulo,
        conversaId,
      });
      const { notifyOwner } = await import("@/lib/xerife/notify.server");
      await notifyOwner(convHo.atribuido_para, corpo);
    } else {
      await alertarAdmins(supabaseAdmin, {
        tipo: "handoff_midia",
        titulo,
        conversaId,
        mensagem: `⚠️ SEM responsável — ${corpo}`,
      });
    }
    console.warn(
      `[${tag}] HANDOFF midia tipo=${tipo} status=aguardando_humano atribuido=${
        convHo?.atribuido_para ? "sim" : "nao"
      } phone=${mascararTelefoneLog(phone)}`,
    );

    // B4 — aviso curto automático (nunca interpreta o arquivo).
    try {
      const aviso =
        "Recebemos seu arquivo! Um especialista da nossa equipe vai analisar e responder por aqui em instantes. Enquanto isso, se puder, me conte a quantidade e a aplicação do pallet que já adianto seu orçamento.";
      const { sendWhatsappText } = await import("@/lib/whatsapp-send.server");
      await sendWhatsappText(phone, aviso, "handoff-midia", "comercial", {
        origem: "resposta_inbound",
      });
      // REGISTRAR E SEGUIR: a mensagem já foi entregue ao cliente; o insert
      // é só histórico e pode ser reconciliado depois.
      const insAviso = await supabaseAdmin.from("whatsapp_mensagens").insert({
        conversa_id: conversaId,
        direcao: "saida",
        autor: "ia",
        conteudo: aviso,
      });
      if (insAviso?.error) {
        const { registrarFalhaSegura } = await import("@/lib/guard-erros");
        await registrarFalhaSegura("whatsapp-inbound/historico-aviso-midia", insAviso.error, {
          conversa_id: conversaId,
          wa_message_id: externalId ?? null,
        });
      }
      console.log(`[${tag}] aviso de mídia enviado phone=${mascararTelefoneLog(phone)}`);
    } catch (e) {
      console.error(
        `[${tag}] falha ao avisar mídia phone=${mascararTelefoneLog(phone)}:`,
        e instanceof Error ? e.message : String(e),
      );
    }

    return { ok: true, conversaId, tipo, handoff: true };
  }

  // 5c) Reação: apenas registrada, sem handoff e sem n8n.
  if (!TIPOS_COM_RESPOSTA_AUTOMATICA.includes(tipo)) {
    return { ok: true, conversaId, tipo, n8n: false };
  }

  // 6) Notifica o n8n se a IA estiver ativa.
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  const n8nSecret = process.env.N8N_SECRET;
  console.log("[n8n-notify] secrets", { hasUrl: !!n8nUrl, hasSecret: !!n8nSecret });
  if (n8nUrl && n8nSecret) {
    const { data: conv } = await supabaseAdmin
      .from("whatsapp_conversas")
      .select("id, phone, lead_id, ia_ativa, status")
      .eq("id", conversaId)
      .maybeSingle();
    console.log("[n8n-notify] conv state", {
      conversaId,
      ia_ativa: conv?.ia_ativa,
      status: conv?.status,
    });
    if (
      conv &&
      conv.ia_ativa &&
      (conv.status === "ia_atendendo" || conv.status === "aguardando_humano")
    ) {
      const { data: hist } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("autor, conteudo, created_at")
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: false })
        .limit(20);
      const historico = (hist ?? []).slice().reverse();
      const { obterPromptAgenteIA } = await import("@/lib/ia-agente-prompt.server");
      const systemPrompt = await obterPromptAgenteIA(supabaseAdmin);
      const payloadOut = {
        conversa_id: conv.id,
        phone: conv.phone,
        lead_id: conv.lead_id,
        historico,
        agente: "Gabriel",
        system_prompt: systemPrompt,
      };
      const { enviarAvisoN8n, enfileirarAvisoN8n, N8N_TIMEOUT_MS } =
        await import("@/lib/n8n-fila.server");
      try {
        await enviarAvisoN8n(n8nUrl, n8nSecret, payloadOut, N8N_TIMEOUT_MS);
        console.log("[n8n-notify] sent", { conversaId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[n8n-notify] failed, enfileirando reenvio:", msg);
        await enfileirarAvisoN8n(supabaseAdmin, { conversaId, payload: payloadOut, erro: msg });
        const { registrarFalha } = await import("@/lib/falhas.server");
        await registrarFalha(supabaseAdmin, "whatsapp.inbound", msg, {
          conversa_id: conv.id,
          lead_id: conv.lead_id,
          acao: "aviso_n8n",
        });
      }
    }
  }

  return { ok: true, conversaId };
}
