/**
 * Presença na WhatsApp Cloud API (Meta): marcar mensagem como lida.
 * A Meta não expõe indicador de "digitando"; a função correspondente foi
 * removida. NUNCA lança: erros são apenas logados (telefone mascarado).
 */
import { mascararTelefoneLog } from "./whatsapp-send.server";

/** Marca a última mensagem recebida como lida. Falha em silêncio. */
export async function marcarComoLida(phone: string, messageId: string | null, tag = "ia") {
  if (!messageId) return false;
  const version = (process.env.META_GRAPH_VERSION ?? "v25.0").trim() || "v25.0";
  const phoneNumberId = (process.env.META_PHONE_NUMBER_ID ?? "").trim();
  const accessToken = (process.env.META_ACCESS_TOKEN ?? "").trim();
  if (!phoneNumberId || !accessToken) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[wa:presenca:${tag}] read status=${res.status} phone=${mascararTelefoneLog(phone)}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[wa:presenca:${tag}] read erro phone=${mascararTelefoneLog(phone)}:`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
