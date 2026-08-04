/**
 * Envio de texto via Telegram Bot API (canal INTERNO).
 * Fail-closed: nunca lança exceção, nunca loga o token.
 */
export type TelegramSendResult = { ok: boolean; error?: string };

export async function sendTelegramText(
  chatId: string,
  texto: string,
  ctx = "interno",
): Promise<TelegramSendResult> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return { ok: false, error: "sem_token" };
  const alvo = (chatId ?? "").trim();
  if (!alvo) return { ok: false, error: "sem_chat_id" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: alvo, text: texto }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[telegram:${ctx}] falha HTTP ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    let parsed: { ok?: boolean; description?: string } | null = null;
    try {
      parsed = JSON.parse(body) as { ok?: boolean; description?: string };
    } catch {
      /* ignore */
    }
    if (parsed && parsed.ok === false) {
      console.error(`[telegram:${ctx}] API respondeu ok=false: ${parsed.description ?? ""}`);
      return { ok: false, error: parsed.description ?? "api_error" };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[telegram:${ctx}] erro de envio:`, e instanceof Error ? e.message : String(e));
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}
