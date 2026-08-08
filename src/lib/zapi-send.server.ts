/**
 * Envio Z-API compartilhado. Único caminho que constrói a URL + headers Z-API,
 * incluindo o header obrigatório `Client-Token` a partir de ZAPI_CLIENT_TOKEN.
 * Usado tanto pelo envio manual (server fn `sendWhatsapp` / `sendConversaMessage`)
 * quanto pelos hooks públicos do n8n (`ia-responder`, `ia-qualificar`).
 *
 * Camada anti-bloqueio (número comercial já foi bloqueado uma vez):
 *   1) guarda de conexão da instância (cache 60s por canal)
 *   2) validação real de entrega (zaapId / messageId no corpo da resposta)
 *   3) rate limit + jitter humano
 *   4) anti-duplicado por hash da mensagem
 *   5) opt-out e janela de envio para mensagens automáticas
 */

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

export type ZapiSendResult = {
  ok: boolean;
  status: number;
  body: string;
  phone: string;
  messageId: string | null;
  zaapId: string | null;
};

export type ZapiCanal = "comercial" | "interno";

const JANELA_MESMO_PHONE_MS = 20_000;
const JANELA_CANAL_MIN_MS = 60_000;
const LIMITE_CANAL_MIN = 20;
const LIMITE_CANAL_24H = 200;
const JANELA_DUPLICADO_MS = 10 * 60_000;
const JITTER_MIN_MS = 1500;
const JITTER_MAX_MS = 4000;
const STATUS_CACHE_MS = 60_000;

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

function credenciais(canal: ZapiCanal) {
  // Canais fisicamente separados. NUNCA há fallback do interno para o comercial.
  return {
    instanceId:
      canal === "interno" ? process.env.ZAPI_INTERNO_INSTANCE_ID : process.env.ZAPI_INSTANCE_ID,
    token: canal === "interno" ? process.env.ZAPI_INTERNO_TOKEN : process.env.ZAPI_TOKEN,
    clientToken:
      canal === "interno" ? process.env.ZAPI_INTERNO_CLIENT_TOKEN : process.env.ZAPI_CLIENT_TOKEN,
  };
}

const statusCache = new Map<ZapiCanal, { at: number; connected: boolean; raw: string }>();

async function garantirConectado(
  canal: ZapiCanal,
  creds: { instanceId: string; token: string; clientToken: string },
  tag: string,
  phone: string,
) {
  const cached = statusCache.get(canal);
  const agora = Date.now();
  if (cached && agora - cached.at < STATUS_CACHE_MS) {
    if (!cached.connected) {
      bloquear(tag, "instancia_desconectada_cache", phone);
      throw new Error("WhatsApp desconectado (Z-API). Mensagem nao enviada.");
    }
    return;
  }

  let connected = false;
  let raw = "";
  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/status`,
      { headers: { "Client-Token": creds.clientToken } },
    );
    raw = await res.text();
    const parsed = JSON.parse(raw) as { connected?: boolean; smartphoneConnected?: boolean };
    connected = parsed.connected === true && parsed.smartphoneConnected === true;
  } catch (e) {
    console.error(`${tag} falha ao consultar status:`, e instanceof Error ? e.message : String(e));
    connected = false;
  }

  statusCache.set(canal, { at: agora, connected, raw });

  if (!connected) {
    console.error(`${tag} instancia nao conectada — status=${raw.slice(0, 300)}`);
    bloquear(tag, "instancia_desconectada", phone);
    await registrarAlertaDesconexao(canal, raw);
    throw new Error("WhatsApp desconectado (Z-API). Mensagem nao enviada.");
  }
}

/**
 * (7) Alerta de desconexão: grava em `zapi_alertas` e dispara UMA notificação
 * interna por canal a cada 60 minutos. Nunca lança — falha aqui jamais pode
 * derrubar o fluxo principal nem mascarar o erro original.
 */
async function registrarAlertaDesconexao(canal: ZapiCanal, detalhe: string) {
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
      `ALERTA: a instancia Z-API do canal ${canal} esta desconectada. Nenhuma mensagem esta saindo.`,
      "zapi-alerta",
      { telegramChatId: chatId, bypassGuards: true },
    );
  } catch (e) {
    console.error("[zapi:alerta] falha ao registrar/enviar alerta:", e instanceof Error ? e.message : String(e));
  }
}


function bloquear(tag: string, motivo: string, phone: string) {
  console.warn(`${tag} BLOQUEADO motivo=${motivo} phone=${phone}`);
}

function isAutomatico(ctx?: string) {
  const c = (ctx ?? "").toLowerCase();
  return c === "ia-responder" || c.includes("xerife");
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

export async function sendZapiText(
  phoneRaw: string,
  message: string,
  ctx?: string,
  canal: ZapiCanal = "comercial",
  opts?: { bypassGuards?: boolean },
): Promise<ZapiSendResult> {
  const { instanceId, token, clientToken } = credenciais(canal);
  const tag = ctx ? `[zapi:${canal}:${ctx}]` : `[zapi:${canal}]`;
  const phone = normalizePhoneBR(phoneRaw);
  const bypass = opts?.bypassGuards === true;

  console.log(
    `${tag} env instance=${!!instanceId}(${instanceId?.length ?? 0}) token=${!!token}(${token?.length ?? 0}) clientToken=${!!clientToken}(${clientToken?.length ?? 0})`,
  );

  if (!instanceId || !token || !clientToken) {
    console.error(
      `${tag} secrets ausentes — instance=${!!instanceId} token=${!!token} clientToken=${!!clientToken}`,
    );
    throw new Error("Z-API não configurado (variáveis ausentes).");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mensagemHash = await hashMensagem(message);

  if (!bypass) {
    // (5) Opt-out do contato
    const { data: optout } = await supabaseAdmin
      .from("whatsapp_optout")
      .select("phone")
      .eq("phone", phone)
      .maybeSingle();
    if (optout) {
      bloquear(tag, "optout", phone);
      throw new Error("Contato optou por nao receber mensagens.");
    }

    // (5) Janela de envio para automáticos
    const { hora, domingo } = agoraSaoPaulo();
    const foraDaJanela = domingo || hora < 7 || hora >= 20;
    if (foraDaJanela) {
      if (isAutomatico(ctx)) {
        bloquear(tag, domingo ? "domingo" : "fora_da_janela_07_20", phone);
        throw new Error(
          "Fora da janela de envio automatico (07:00-20:00, exceto domingos). Mensagem nao enviada.",
        );
      }
      console.warn(`${tag} AVISO envio manual fora da janela 07:00-20:00 phone=${phone}`);
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
      throw new Error("Limite de envios por minuto atingido neste canal. Tente novamente em instantes.");
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

    // (1) Guarda de conexão
    await garantirConectado(canal, { instanceId, token, clientToken }, tag, phone);

    // (3) Jitter humano
    await sleep(JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS)));
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

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

  let ultimoErro: Error = new Error("Falha desconhecida no envio Z-API.");

  // (8) Tentativa inicial + no máximo 2 retentativas com backoff 2s e 5s,
  // exclusivamente para falhas transitórias (rede/timeout, 429 e 5xx).
  for (let tentativa = 1; tentativa <= RETRY_BACKOFF_MS.length + 1; tentativa++) {
    if (tentativa > 1) {
      if (await jaEnviadoRecentemente()) {
        console.warn(`${tag} tentativa=${tentativa} abortada — envio ja registrado (idempotencia).`);
        return { ok: true, status: 200, body: "", phone, messageId: null, zaapId: null };
      }
      const espera = RETRY_BACKOFF_MS[tentativa - 2]!;
      console.warn(`${tag} retry em ${espera}ms (tentativa=${tentativa}) motivo=${ultimoErro.message}`);
      await sleep(espera);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": clientToken,
        },
        body: JSON.stringify({ phone, message }),
      });
    } catch (e) {
      // Falha transitória de rede/timeout → elegível a retry
      ultimoErro = new Error(
        `Falha de rede ao enviar pelo WhatsApp: ${e instanceof Error ? e.message : String(e)}`,
      );
      console.error(`${tag} tentativa=${tentativa} erro de rede: ${ultimoErro.message}`);
      continue;
    }

    const body = await res.text();
    console.log(
      `${tag} tentativa=${tentativa} send-text status=${res.status} phone=${phone} bodyLen=${body.length}`,
    );

    if (!res.ok) {
      console.error(`${tag} tentativa=${tentativa} send-text falhou [${res.status}]: ${body}`);
      const erro = new Error(`Z-API [${res.status}]: ${body}`);
      if (RETRY_STATUS.has(res.status)) {
        ultimoErro = erro;
        continue; // transitório → retry
      }
      throw erro; // 4xx (exceto 429) → nunca retenta
    }

    // (2) Validação real de entrega
    let zaapId: string | null = null;
    let messageId: string | null = null;
    try {
      const parsed = JSON.parse(body) as { zaapId?: string; messageId?: string };
      zaapId = parsed.zaapId ?? null;
      messageId = parsed.messageId ?? null;
    } catch {
      /* body não-JSON → tratado como falha abaixo */
    }
    if (!zaapId && !messageId) {
      console.error(
        `${tag} tentativa=${tentativa} resposta sem zaapId/messageId — envio NAO confirmado: ${body.slice(0, 300)}`,
      );
      // Sem identificador não há retry (pode ter entregue).
      throw new Error("Envio nao confirmado pelo WhatsApp (sem identificador de mensagem).");
    }

    // (8) Registro único por mensagem
    const { error: regErr } = await supabaseAdmin
      .from("zapi_envios")
      .insert({ canal, phone, ctx: ctx ?? null, mensagem_hash: mensagemHash });
    if (regErr) console.error(`${tag} falha ao registrar envio:`, regErr.message);

    return { ok: true, status: res.status, body, phone, messageId, zaapId };
  }

  throw ultimoErro;
}

