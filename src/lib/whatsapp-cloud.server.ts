/**
 * (Cloud API) Cliente da WhatsApp Cloud API oficial da Meta.
 * Convive com a Z-API: só é usado quando WHATSAPP_DRIVER=cloud.
 * NUNCA logar o access token nem o header Authorization.
 */

const TIMEOUT_MS = 15_000;

export type CloudResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  status?: number;
};

function creds() {
  return {
    version: (process.env.META_GRAPH_VERSION ?? "v25.0").trim() || "v25.0",
    phoneNumberId: (process.env.META_PHONE_NUMBER_ID ?? "").trim(),
    wabaId: (process.env.META_WABA_ID ?? "").trim(),
    accessToken: (process.env.META_ACCESS_TOKEN ?? "").trim(),
  };
}

/** True quando os secrets mínimos da Cloud API estão configurados. */
export function cloudEnabled(): boolean {
  const { phoneNumberId, accessToken } = creds();
  return !!phoneNumberId && !!accessToken;
}

/** Garante somente dígitos e DDI 55 (padrão E.164 sem o "+"). */
export function normalizePhoneE164(phone: string): string {
  let p = String(phone ?? "").replace(/\D/g, "");
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

async function postMessages(body: Record<string, unknown>, tag: string): Promise<CloudResult> {
  const { version, phoneNumberId, accessToken } = creds();
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: "WhatsApp Cloud API não configurado (variáveis ausentes)." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const texto = await res.text();
    if (!res.ok) {
      console.error(`[wa-cloud:${tag}] status=${res.status} body=${texto.slice(0, 300)}`);
      return { ok: false, status: res.status, error: texto.slice(0, 500) };
    }
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(texto) as { messages?: Array<{ id?: string }> };
      messageId = parsed.messages?.[0]?.id;
    } catch {
      /* corpo não-JSON */
    }
    if (!messageId) {
      return { ok: false, status: res.status, error: "Resposta sem identificador de mensagem." };
    }
    return { ok: true, status: res.status, messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[wa-cloud:${tag}] erro de rede: ${msg}`);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Envia mensagem de texto simples. */
export async function cloudSendText(to: string, body: string): Promise<CloudResult> {
  return postMessages(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhoneE164(to),
      type: "text",
      text: { preview_url: false, body },
    },
    "send-text",
  );
}

/**
 * Envia mídia por LINK público (sem upload prévio de media id na Meta).
 * A mesma URL usada aqui é a gravada em `midia.url` para o renderizador do chat.
 * Áudio não aceita caption na API da Meta.
 */
export async function cloudSendMedia(
  to: string,
  tipo: "image" | "document" | "audio" | "video",
  url: string,
  opts?: { caption?: string; filename?: string },
): Promise<CloudResult> {
  const caption = opts?.caption?.trim() || undefined;
  let payload: Record<string, unknown>;
  if (tipo === "audio") {
    payload = { link: url };
  } else if (tipo === "document") {
    payload = {
      link: url,
      ...(caption ? { caption } : {}),
      ...(opts?.filename ? { filename: opts.filename } : {}),
    };
  } else {
    payload = { link: url, ...(caption ? { caption } : {}) };
  }

  return postMessages(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhoneE164(to),
      type: tipo,
      [tipo]: payload,
    },
    `send-${tipo}`,
  );
}



/** Envia template aprovado (necessário fora da janela de 24h). */
export async function cloudSendTemplate(
  to: string,
  templateName: string,
  langCode: string,
  components?: unknown[],
): Promise<CloudResult> {
  // Normaliza: `components` vazio nunca deve ser enviado à Meta.
  const comps = Array.isArray(components) ? components.filter(Boolean) : [];
  return postMessages(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhoneE164(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: langCode },
        ...(comps.length ? { components: comps } : {}),
      },
    },
    "send-template",
  );
}


/** Diagnóstico do número — nunca expõe o token. */
export async function cloudHealth(): Promise<{
  configurado: boolean;
  ok: boolean;
  status?: number;
  detalhe?: string;
}> {
  const { version, phoneNumberId, accessToken } = creds();
  if (!phoneNumberId || !accessToken) return { configurado: false, ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
    );
    const texto = await res.text();
    return { configurado: true, ok: res.ok, status: res.status, detalhe: texto.slice(0, 500) };
  } catch (e) {
    return {
      configurado: true,
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** (Diagnóstico) GET no próprio phone number id — somente leitura, não altera nada na Meta. */
export async function cloudDiagnosticoNumero(): Promise<{
  configurado: boolean;
  http_status: number | null;
  dados: unknown;
}> {
  const { version, phoneNumberId, accessToken } = creds();
  if (!phoneNumberId || !accessToken) return { configurado: false, http_status: null, dados: null };

  const campos = [
    "verified_name",
    "code_verification_status",
    "quality_rating",
    "platform_type",
    "throughput",
    "name_status",
  ].join(",");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}?fields=${campos}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
    );
    const texto = await res.text();
    let dados: unknown = texto.slice(0, 1000);
    try {
      dados = JSON.parse(texto);
    } catch {
      /* corpo não-JSON */
    }
    return { configurado: true, http_status: res.status, dados };
  } catch (e) {
    return {
      configurado: true,
      http_status: null,
      dados: { error: { message: e instanceof Error ? e.message : String(e) } },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** (Assinatura) GET /{waba-id}/subscribed_apps — somente leitura. */
export async function cloudListarAppsInscritos(): Promise<{
  ok: boolean;
  http_status: number | null;
  body: unknown;
}> {
  return subscribedApps("GET");
}

/** (Assinatura) POST /{waba-id}/subscribed_apps — inscreve o app na WABA. */
export async function cloudInscreverWaba(): Promise<{
  ok: boolean;
  http_status: number | null;
  body: unknown;
}> {
  return subscribedApps("POST");
}

async function subscribedApps(method: "GET" | "POST") {
  const { version, wabaId, accessToken } = creds();
  if (!wabaId || !accessToken) {
    return {
      ok: false,
      http_status: null,
      body: { error: { message: "WABA não configurada (variáveis ausentes)." } },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const texto = await res.text();
    let body: unknown = texto.slice(0, 1000);
    try {
      body = JSON.parse(texto);
    } catch {
      /* corpo não-JSON */
    }
    return { ok: res.ok, http_status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      http_status: null,
      body: { error: { message: e instanceof Error ? e.message : String(e) } },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * (Registro) POST /{phone-number-id}/register com PIN de 6 dígitos.
 * O PIN só trafega desta chamada para a Graph API: nunca é gravado nem logado.
 */
export async function cloudRegistrarNumero(pin: string): Promise<{
  ok: boolean;
  http_status: number | null;
  erro_codigo: number | null;
  erro_mensagem: string | null;
}> {
  const { version, phoneNumberId, accessToken } = creds();
  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      http_status: null,
      erro_codigo: null,
      erro_mensagem: "WhatsApp Cloud API não configurado (variáveis ausentes).",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      signal: controller.signal,
    });
    const texto = await res.text();
    let erroCodigo: number | null = null;
    let erroMensagem: string | null = null;
    let sucesso = res.ok;
    try {
      const parsed = JSON.parse(texto) as {
        success?: boolean;
        error?: { code?: number; message?: string };
      };
      if (parsed.error) {
        erroCodigo = parsed.error.code ?? null;
        erroMensagem = parsed.error.message ?? null;
      }
      if (typeof parsed.success === "boolean") sucesso = res.ok && parsed.success;
    } catch {
      if (!res.ok) erroMensagem = texto.slice(0, 300);
    }
    return { ok: sucesso, http_status: res.status, erro_codigo: erroCodigo, erro_mensagem: erroMensagem };
  } catch (e) {
    return {
      ok: false,
      http_status: null,
      erro_codigo: null,
      erro_mensagem: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * (Templates) Lista de templates APROVADOS da WABA, com cache curto.
 * ------------------------------------------------------------------ */

export type TemplateAprovado = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  variaveis: number;
  exemplos: string[];
  suportado: boolean;
  motivoNaoSuportado?: string;
};

type MetaComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: Array<{ type?: string; url?: string }>;
};

const CACHE_TTL_MS = 5 * 60_000;
let cacheTemplates: { at: number; itens: TemplateAprovado[] } | null = null;

/** Conta variáveis {{n}} distintas do corpo. */
function contarVars(body: string): number {
  const nums = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.add(Number(m[1]));
  return nums.size === 0 ? 0 : Math.max(...nums);
}

function normalizarTemplate(t: {
  name?: string;
  language?: string;
  category?: string;
  components?: MetaComponent[];
}): TemplateAprovado | null {
  const comps = t.components ?? [];
  const body = comps.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  if (!body?.text) return null;

  const header = comps.find((c) => (c.type ?? "").toUpperCase() === "HEADER");
  const botoes = comps.find((c) => (c.type ?? "").toUpperCase() === "BUTTONS");

  let suportado = true;
  let motivo: string | undefined;

  const formato = (header?.format ?? "TEXT").toUpperCase();
  if (header && formato !== "TEXT") {
    suportado = false;
    motivo = "Template com mídia no cabeçalho não é suportado no momento.";
  } else if (header?.text && contarVars(header.text) > 0) {
    suportado = false;
    motivo = "Template com variável no cabeçalho não é suportado no momento.";
  } else if ((botoes?.buttons ?? []).some((b) => (b.url ?? "").includes("{{"))) {
    suportado = false;
    motivo = "Template com botão de URL dinâmico não é suportado no momento.";
  }

  return {
    name: t.name ?? "",
    language: t.language ?? "",
    category: t.category ?? "",
    bodyText: body.text,
    variaveis: contarVars(body.text),
    exemplos: body.example?.body_text?.[0] ?? [],
    suportado,
    ...(motivo ? { motivoNaoSuportado: motivo } : {}),
  };
}

/** GET /{waba-id}/message_templates?status=APPROVED — somente leitura, cache 5 min. */
export async function cloudListarTemplatesAprovados(
  forcar = false,
): Promise<{ ok: boolean; erro?: string; itens: TemplateAprovado[] }> {
  if (!forcar && cacheTemplates && Date.now() - cacheTemplates.at < CACHE_TTL_MS) {
    return { ok: true, itens: cacheTemplates.itens };
  }

  const { version, wabaId, accessToken } = creds();
  if (!wabaId || !accessToken) {
    return { ok: false, erro: "WABA não configurada (variáveis ausentes).", itens: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      `https://graph.facebook.com/${version}/${wabaId}/message_templates` +
      `?status=APPROVED&limit=100&fields=name,language,category,status,components`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const texto = await res.text();
    if (!res.ok) {
      console.error(`[wa-cloud:templates] status=${res.status} body=${texto.slice(0, 300)}`);
      return { ok: false, erro: texto.slice(0, 300), itens: [] };
    }
    const parsed = JSON.parse(texto) as { data?: Array<Record<string, unknown>> };
    const itens = (parsed.data ?? [])
      .map((t) => normalizarTemplate(t as never))
      .filter((t): t is TemplateAprovado => t !== null);
    cacheTemplates = { at: Date.now(), itens };
    return { ok: true, itens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[wa-cloud:templates] erro: ${msg}`);
    return { ok: false, erro: msg, itens: [] };
  } finally {
    clearTimeout(timer);
  }
}
