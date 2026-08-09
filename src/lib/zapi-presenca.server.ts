/**
 * (E2) Marcar como lida + presença "digitando" na Z-API.
 * NUNCA lança: qualquer erro é apenas logado (telefone sempre mascarado)
 * e o fluxo de resposta segue normalmente.
 */
import { mascararTelefoneLog } from "./zapi-send.server";

function credsComercial() {
  return {
    instanceId: (process.env.ZAPI_INSTANCE_ID ?? "").trim(),
    token: (process.env.ZAPI_TOKEN ?? "").trim(),
    clientToken: (process.env.ZAPI_CLIENT_TOKEN ?? "").trim(),
  };
}

async function chamar(path: string, body: Record<string, unknown>, phone: string, tag: string) {
  const { instanceId, token, clientToken } = credsComercial();
  if (!instanceId || !token || !clientToken) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": clientToken },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.warn(
        `[zapi:presenca:${tag}] ${path} status=${res.status} phone=${mascararTelefoneLog(phone)}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[zapi:presenca:${tag}] ${path} erro phone=${mascararTelefoneLog(phone)}:`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Marca a última mensagem recebida como lida. Falha em silêncio. */
export async function marcarComoLida(phone: string, messageId: string | null, tag = "ia") {
  if (!messageId) return false;
  return chamar("read-message", { phone, messageId }, phone, tag);
}

/** Liga/desliga o estado "digitando". Falha em silêncio. */
export async function definirDigitando(phone: string, digitando: boolean, tag = "ia") {
  return chamar(
    "send-chat-state",
    { phone, chatState: digitando ? "composing" : "available" },
    phone,
    tag,
  );
}
