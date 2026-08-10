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

/** Envia template aprovado (necessário fora da janela de 24h). */
export async function cloudSendTemplate(
  to: string,
  templateName: string,
  langCode: string,
  components?: unknown[],
): Promise<CloudResult> {
  return postMessages(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhoneE164(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: langCode },
        ...(components && components.length ? { components } : {}),
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
