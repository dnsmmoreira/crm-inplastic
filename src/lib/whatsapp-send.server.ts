/**
 * Envio de WhatsApp — driver ÚNICO: Cloud API oficial da Meta.
 *
 * A Z-API foi removida do projeto. Este é o único caminho de saída.
 *
 * TODAS as guardas anteriores continuam valendo, na mesma ordem:
 *   0) disjuntor (envio automático pausado)
 *   1) opt-out do contato
 *   2) janela 07:00-20:00 + bloqueio de domingo (origem `iniciado_sistema`)
 *   3) rate limit: 20s por telefone, 20/min por canal, 200/24h por canal
 *   4) anti-duplicado (mesmo hash em 10 min)
 *   5) guarda de configuração do canal de saída
 *   6) jitter humano
 *   7) validação real de entrega (id de mensagem no corpo da resposta)
 *   8) retry com backoff + idempotência por phone+hash
 *
 * (ITEM I) Janela de 24h: mensagens iniciadas pelo sistema fora da janela de
 * atendimento (nenhuma mensagem inbound do contato nas últimas 24h) saem como
 * TEMPLATE aprovado; dentro da janela saem como texto livre.
 */

import type { ZapiCanal, ZapiOrigem, ZapiSendResult } from "./zapi-types";

export type { ZapiCanal, ZapiOrigem, ZapiSendResult };

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

/** Mascara telefone para logs: apenas os 4 ultimos digitos (ex.: ****7690). */
export function mascararTelefoneLog(phone: string): string {
  const d = onlyDigits(phone);
  if (!d) return "****";
  return `****${d.slice(-4)}`;
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

const JANELA_MESMO_PHONE_MS = 20_000;
const JANELA_CANAL_MIN_MS = 60_000;
const LIMITE_CANAL_MIN = 20;
const LIMITE_CANAL_24H = 200;
const JANELA_DUPLICADO_MS = 10 * 60_000;
const JITTER_MIN_MS = 1500;
const JITTER_MAX_MS = 4000;

/** (ITEM I) Janela de atendimento da Meta: 24h desde a última inbound. */
const JANELA_ATENDIMENTO_MS = 24 * 60 * 60_000;

/** Normaliza o texto para hash: minúsculas, sem acentos, sem espaços duplicados. */
export function normalizarTexto(texto: string) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function hashMensagem(texto: string) {
  const norm = normalizarTexto(texto);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Alerta de canal indisponível: grava em `zapi_alertas` (tabela histórica,
 * preservada) e dispara UMA notificação interna por canal a cada 60 minutos.
 * Nunca lança.
 */
async function registrarAlertaIndisponivel(canal: ZapiCanal, detalhe: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("zapi_alertas")
      .select("id", { count: "exact", head: true })
      .eq("canal", canal)
      .eq("tipo", "desconectado")
      .gte("created_at", desde);

    await supabaseAdmin
      .from("zapi_alertas")
      .insert({ canal, tipo: "desconectado", detalhe: detalhe.slice(0, 1000) || null });

    if ((count ?? 0) > 0) return; // já avisou nos últimos 60 min

    const { enviarNotificacaoInterna } = await import("@/lib/xerife/notify.server");
    const phone = (process.env.WHATSAPP_DIRETORIA ?? "").trim();
    const chatId = (process.env.TELEGRAM_CHAT_DIRETORIA ?? "").trim() || null;
    await enviarNotificacaoInterna(
      phone,
      `ALERTA: o canal ${canal} do WhatsApp (Cloud API) esta indisponivel. Nenhuma mensagem esta saindo.`,
      "wa-alerta",
      { telegramChatId: chatId, bypassGuards: true },
    );
  } catch (e) {
    console.error(
      "[wa:alerta] falha ao registrar/enviar alerta:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

function bloquear(tag: string, motivo: string, phone: string) {
  console.warn(`${tag} BLOQUEADO motivo=${motivo} phone=${mascararTelefoneLog(phone)}`);
}

/** Retorna { hora, domingo } no fuso America/Sao_Paulo. */
function agoraSaoPaulo() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hora, domingo: weekday === "Sun" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const RETRY_BACKOFF_MS = [2000, 5000];
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * (ITEM I) Janela de 24h — derivada de dados já existentes, sem coluna nova:
 * busca a conversa pelo telefone e a última mensagem com `autor='cliente'`
 * (direção de entrada). Se houver inbound nas últimas 24h, a janela está
 * aberta e o envio pode ser texto livre.
 */
export async function janelaAtendimentoAberta(phone: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conversas } = await supabaseAdmin
    .from("whatsapp_conversas")
    .select("id")
    .eq("phone", phone);

  const ids = (conversas ?? []).map((c) => c.id);
  if (ids.length === 0) return false;

  const desde = new Date(Date.now() - JANELA_ATENDIMENTO_MS).toISOString();
  const { count } = await supabaseAdmin
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .in("conversa_id", ids)
    .eq("autor", "cliente")
    .gte("created_at", desde);

  return (count ?? 0) > 0;
}

/**
 * Resolve o primeiro nome do contato para preencher {{1}} do template.
 * Ordem: conversa (name) → lead vinculado (contact_name) → cliente do lead.
 * Nunca lança: em qualquer falha retorna o fallback seguro.
 */
export async function resolverPrimeiroNomeContato(phone: string): Promise<string> {
  const { primeiroNome, NOME_FALLBACK } = await import("./whatsapp-template");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conversa } = await supabaseAdmin
      .from("whatsapp_conversas")
      .select("name, lead_id")
      .eq("phone", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversa?.name && primeiroNome(conversa.name) !== NOME_FALLBACK) {
      return primeiroNome(conversa.name);
    }

    if (conversa?.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("contact_name, cliente_id")
        .eq("id", conversa.lead_id)
        .maybeSingle();
      if (lead?.contact_name && primeiroNome(lead.contact_name) !== NOME_FALLBACK) {
        return primeiroNome(lead.contact_name);
      }
      if (lead?.cliente_id) {
        const { data: cliente } = await supabaseAdmin
          .from("clientes")
          .select("contato, nome_fantasia, razao_social")
          .eq("id", lead.cliente_id)
          .maybeSingle();
        const candidato = cliente?.contato ?? cliente?.nome_fantasia ?? cliente?.razao_social;
        if (candidato && primeiroNome(candidato) !== NOME_FALLBACK) return primeiroNome(candidato);
      }
    }
  } catch (e) {
    console.warn(`[wa] falha ao resolver nome do contato: ${e instanceof Error ? e.message : e}`);
  }
  return NOME_FALLBACK;
}

export async function sendWhatsappText(
  phoneRaw: string,
  message: string,
  ctx?: string,
  canal: ZapiCanal = "comercial",
  opts?: {
    bypassGuards?: boolean;
    origem?: ZapiOrigem;
    /**
     * Força o envio como template aprovado com nome/idioma explícitos
     * (usado pelo teste administrativo). Parâmetros de corpo opcionais.
     * Todas as guardas continuam valendo normalmente.
     */
    templateOverride?: { name: string; lang: string; params?: string[] };
    /**
     * Só pode ser ativada pelo teste administrativo (`testarEnvioCloud`).
     * Quando true, pula APENAS a verificação da janela 07:00-20:00 / domingo.
     * Todas as demais guardas continuam valendo.
     */
    ignorarJanelaHorario?: boolean;
  },
): Promise<ZapiSendResult> {

  const tag = ctx ? `[wa:${canal}:${ctx}]` : `[wa:${canal}]`;
  const phone = normalizePhoneBR(phoneRaw);
  const bypass = opts?.bypassGuards === true;
  const ignorarJanelaHorario = opts?.ignorarJanelaHorario === true;
  const origem: ZapiOrigem = opts?.origem ?? "iniciado_sistema";


  const { cloudEnabled, cloudSendText, cloudSendTemplate } =
    await import("./whatsapp-cloud.server");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mensagemHash = await hashMensagem(message);

  if (!bypass) {
    // (0) Disjuntor: enquanto pausado, nenhum envio AUTOMÁTICO sai do canal
    // comercial. Envio manual de admin continua permitido.
    if (canal === "comercial" && origem !== "manual_admin") {
      const { envioAutomaticoPausado } = await import("./zapi-disjuntor.server");
      if (await envioAutomaticoPausado()) {
        bloquear(tag, "disjuntor_aberto", phone);
        throw new Error(
          "Envios automaticos pausados temporariamente (disjuntor). Tente mais tarde.",
        );
      }
    }

    // (1) Opt-out do contato
    const { data: optout } = await supabaseAdmin
      .from("whatsapp_optout")
      .select("phone")
      .eq("phone", phone)
      .maybeSingle();
    if (optout) {
      bloquear(tag, "optout", phone);
      throw new Error("Contato optou por nao receber mensagens.");
    }

    // (2) Janela de envio — pulada apenas no teste administrativo.
    if (ignorarJanelaHorario) {
      console.log(`${tag} janela de horario ignorada motivo=teste_admin`);
    } else {
      const { hora, domingo } = agoraSaoPaulo();
      const foraDaJanela = domingo || hora < 7 || hora >= 20;
      if (foraDaJanela) {
        if (origem === "resposta_inbound") {
          // Liberado 24/7: é resposta a mensagem iniciada pelo cliente.
          console.log(
            `${tag} envio fora da janela liberado motivo=resposta_inbound${domingo ? " (domingo)" : ""}`,
          );
        } else if (origem === "manual_admin") {
          // Liberado 24/7: admin autenticado respondendo conversa com inbound.
          console.log(
            `${tag} envio fora da janela liberado motivo=manual_admin_com_inbound${domingo ? " (domingo)" : ""}`,
          );
        } else {
          bloquear(tag, domingo ? "domingo" : "fora_da_janela_07_20", phone);
          throw new Error(
            "Fora da janela de envio (07:00-20:00, exceto domingos). Mensagem nao enviada.",
          );
        }
      }
    }


    const nowMs = Date.now();
    const isoDesde = (ms: number) => new Date(nowMs - ms).toISOString();

    // (3) Rate limit: mesmo telefone nos últimos 20s
    const { count: cMesmoPhone } = await supabaseAdmin
      .from("zapi_envios")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", isoDesde(JANELA_MESMO_PHONE_MS));
    if ((cMesmoPhone ?? 0) > 0) {
      bloquear(tag, "rate_limit_mesmo_phone_20s", phone);
      throw new Error("Aguarde 20 segundos antes de enviar outra mensagem para este contato.");
    }

    // (3) Rate limit: canal por minuto
    const { count: cCanalMin } = await supabaseAdmin
      .from("zapi_envios")
      .select("id", { count: "exact", head: true })
      .eq("canal", canal)
      .gte("created_at", isoDesde(JANELA_CANAL_MIN_MS));
    if ((cCanalMin ?? 0) >= LIMITE_CANAL_MIN) {
      bloquear(tag, "rate_limit_canal_minuto", phone);
      throw new Error(
        "Limite de envios por minuto atingido neste canal. Tente novamente em instantes.",
      );
    }

    // (3) Rate limit: canal por 24h
    const { count: cCanal24h } = await supabaseAdmin
      .from("zapi_envios")
      .select("id", { count: "exact", head: true })
      .eq("canal", canal)
      .gte("created_at", isoDesde(24 * 60 * 60_000));
    if ((cCanal24h ?? 0) >= LIMITE_CANAL_24H) {
      bloquear(tag, "rate_limit_canal_24h", phone);
      throw new Error("Limite diario de envios deste canal atingido (200 em 24h).");
    }

    // (4) Anti-duplicado
    const { count: cDup } = await supabaseAdmin
      .from("zapi_envios")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("mensagem_hash", mensagemHash)
      .gte("created_at", isoDesde(JANELA_DUPLICADO_MS));
    if ((cDup ?? 0) > 0) {
      bloquear(tag, "duplicado_10min", phone);
      throw new Error("Mensagem duplicada bloqueada (anti-spam).");
    }

    // (5) Guarda do canal de saída (substitui a antiga guarda de conexão Z-API)
    if (!cloudEnabled()) {
      bloquear(tag, "cloud_nao_configurado", phone);
      await registrarAlertaIndisponivel(canal, "META_PHONE_NUMBER_ID/META_ACCESS_TOKEN ausentes");
      throw new Error("WhatsApp Cloud API nao configurado. Mensagem nao enviada.");
    }

    // (6) Jitter humano
    await sleep(JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS)));
  }

  if (!cloudEnabled()) {
    throw new Error("WhatsApp Cloud API nao configurado (variaveis ausentes).");
  }

  /**
   * (ITEM I) Decide texto livre x template.
   * - `resposta_inbound` e `manual_admin` só ocorrem com inbound recente → texto.
   * - `iniciado_sistema`: consulta a janela de 24h; fechada → template aprovado.
   */
  const override = opts?.templateOverride;
  let usarTemplate = !!override;
  if (!override && origem === "iniciado_sistema") {
    usarTemplate = !(await janelaAtendimentoAberta(phone));
  }

  const { montarComponenteBody, TEMPLATES_PROIBIDOS_PRODUCAO } =
    await import("./whatsapp-template");

  const templateName =
    override?.name ??
    ((process.env.META_TEMPLATE_NAME ?? "").trim() || "retomada_atendimento");
  const templateLang =
    override?.lang ?? ((process.env.META_TEMPLATE_LANG ?? "pt_BR").trim() || "pt_BR");
  if (usarTemplate && !templateName) {
    bloquear(tag, "fora_janela_24h_sem_template", phone);
    throw new Error(
      "Fora da janela de 24h do cliente: e obrigatorio um template aprovado (META_TEMPLATE_NAME nao configurado).",
    );
  }
  // Nunca usar template de demonstração em envio de produção (só no teste admin).
  if (usarTemplate && !override && TEMPLATES_PROIBIDOS_PRODUCAO.has(templateName)) {
    bloquear(tag, "template_proibido_producao", phone);
    throw new Error(
      `Template "${templateName}" nao pode ser usado em producao. Configure META_TEMPLATE_NAME com um template aprovado em pt_BR.`,
    );
  }

  // Componente BODY: {{1}} = primeiro nome do contato (automático) ou os
  // parâmetros explícitos informados pelo teste administrativo.
  let componentes: unknown[] = [];
  if (usarTemplate) {
    componentes = override
      ? montarComponenteBody(override.params ?? [])
      : montarComponenteBody([await resolverPrimeiroNomeContato(phone)]);
  }


  /** (8) Idempotência: já existe registro deste phone+hash nos últimos 60s? */
  async function jaEnviadoRecentemente() {
    const desde = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("zapi_envios")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("mensagem_hash", mensagemHash)
      .gte("created_at", desde);
    return (count ?? 0) > 0;
  }

  let ultimoErro: Error = new Error("Falha desconhecida no envio de WhatsApp.");

  // (8) Tentativa inicial + no máximo 2 retentativas com backoff 2s e 5s,
  // exclusivamente para falhas transitórias (rede/timeout, 429 e 5xx).
  for (let tentativa = 1; tentativa <= RETRY_BACKOFF_MS.length + 1; tentativa++) {
    if (tentativa > 1) {
      if (await jaEnviadoRecentemente()) {
        console.warn(
          `${tag} tentativa=${tentativa} abortada — envio ja registrado (idempotencia).`,
        );
        return { ok: true, status: 200, body: "", phone, messageId: null, zaapId: null };
      }
      const espera = RETRY_BACKOFF_MS[tentativa - 2]!;
      console.warn(
        `${tag} retry em ${espera}ms (tentativa=${tentativa}) motivo=${ultimoErro.message}`,
      );
      await sleep(espera);
    }

    const r = usarTemplate
      ? await cloudSendTemplate(
          phone,
          templateName,
          templateLang,
          override
            ? []
            : [{ type: "body", parameters: [{ type: "text", text: message.slice(0, 900) }] }],
        )
      : await cloudSendText(phone, message);

    console.log(
      `${tag} tentativa=${tentativa} ${usarTemplate ? "template" : "texto"} ok=${r.ok} status=${r.status ?? "-"} phone=${mascararTelefoneLog(phone)}`,
    );

    if (!r.ok) {
      const erro = new Error(
        `WhatsApp Cloud API${r.status ? ` [${r.status}]` : ""}: ${r.error ?? "falha"}`,
      );
      // Transitório (rede/timeout sem status, 429 e 5xx) → retry.
      if (r.status === undefined || RETRY_STATUS.has(r.status)) {
        ultimoErro = erro;
        continue;
      }
      throw erro; // 4xx (exceto 429) → nunca retenta
    }

    // (7) Validação real de entrega — `cloudSendText`/`cloudSendTemplate` só
    // retornam ok=true quando há identificador de mensagem no corpo.

    // (8) Registro único por mensagem
    const { error: regErr } = await supabaseAdmin
      .from("zapi_envios")
      .insert({ canal, phone, ctx: ctx ?? null, mensagem_hash: mensagemHash });
    if (regErr) console.error(`${tag} falha ao registrar envio:`, regErr.message);

    return {
      ok: true,
      status: r.status ?? 200,
      body: "",
      phone,
      messageId: r.messageId ?? null,
      zaapId: null,
    };
  }

  throw ultimoErro;
}


