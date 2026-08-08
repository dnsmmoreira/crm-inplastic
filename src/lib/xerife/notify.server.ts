/**
 * Notificações INTERNAS (vendedores / admins / diretoria).
 * Ponto único de estrangulamento: `enviarNotificacaoInterna`.
 * Usa exclusivamente o canal 'interno' da Z-API (ZAPI_INTERNO_*).
 * NUNCA envia para leads e NUNCA cai nas credenciais comerciais.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient<any, any, any>;

const phoneCache = new Map<string, string | null>();
const telegramChatCache = new Map<string, string | null>();

export async function getOwnerTelegramChatId(sb: SB, ownerId: string): Promise<string | null> {
  if (telegramChatCache.has(ownerId)) return telegramChatCache.get(ownerId)!;
  const { data } = await sb
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", ownerId)
    .maybeSingle();
  const c = ((data?.telegram_chat_id ?? "") as string).trim() || null;
  telegramChatCache.set(ownerId, c);
  return c;
}

export type ResultadoNotificacaoInterna = {
  enviado: boolean;
  motivo?:
    | "canal_interno_desligado"
    | "canal_interno_sem_credencial"
    | "sem_destino"
    | "erro_envio"
    | "telegram_sem_token"
    | "sem_chat_id";
};

export async function getOwnerPhone(sb: SB, ownerId: string): Promise<string | null> {
  if (phoneCache.has(ownerId)) return phoneCache.get(ownerId)!;
  const { data } = await sb
    .from("profiles")
    .select("telefone_whatsapp")
    .eq("id", ownerId)
    .maybeSingle();
  const p = (data?.telefone_whatsapp ?? "").trim() || null;
  phoneCache.set(ownerId, p);
  return p;
}

/**
 * ÚNICO caminho autorizado para mandar WhatsApp para público interno.
 * Fail-closed: jamais lança exceção.
 */
export async function enviarNotificacaoInterna(
  destino: string | null | undefined,
  texto: string,
  ctx = "interno",
  opts?: { telegramChatId?: string | null; bypassGuards?: boolean },
): Promise<ResultadoNotificacaoInterna> {
  try {
    // ---- Trilho TELEGRAM (tem precedência quando xerife_config.telegram_ativo = true) ----
    {
      const { supabaseAdmin: sbTg } = await import("@/integrations/supabase/client.server");
      const { data: cfgTg } = await sbTg
        .from("xerife_config")
        .select("telegram_ativo")
        .eq("id", 1)
        .maybeSingle();
      if (cfgTg?.telegram_ativo) {
        const tgToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
        if (!tgToken) {
          console.warn(
            "[notificacao-interna] TELEGRAM_BOT_TOKEN ausente — nada enviado (sem fallback WhatsApp/comercial).",
          );
          return { enviado: false, motivo: "telegram_sem_token" };
        }
        const chatId = (opts?.telegramChatId ?? "").trim();
        if (!chatId) return { enviado: false, motivo: "sem_chat_id" };
        const { sendTelegramText } = await import("@/lib/telegram-send.server");
        const tg = await sendTelegramText(chatId, texto, ctx);
        return tg.ok ? { enviado: true } : { enviado: false, motivo: "erro_envio" };
      }
    }

    const alvo = (destino ?? "").trim();
    if (!alvo) return { enviado: false, motivo: "sem_destino" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("xerife_config")
      .select("whatsapp_interno_ativo")
      .eq("id", 1)
      .maybeSingle();

    if (!cfg?.whatsapp_interno_ativo) {
      console.warn("[notificacao-interna] canal interno desligado — nada enviado.");
      return { enviado: false, motivo: "canal_interno_desligado" };
    }

    const instanceId = (process.env.ZAPI_INTERNO_INSTANCE_ID ?? "").trim();
    const token = (process.env.ZAPI_INTERNO_TOKEN ?? "").trim();
    const clientToken = (process.env.ZAPI_INTERNO_CLIENT_TOKEN ?? "").trim();
    if (!instanceId || !token || !clientToken) {
      console.warn(
        "[notificacao-interna] credenciais ZAPI_INTERNO_* ausentes — nada enviado (sem fallback comercial).",
      );
      return { enviado: false, motivo: "canal_interno_sem_credencial" };
    }

    const { sendZapiText } = await import("@/lib/zapi-send.server");
    await sendZapiText(alvo, texto, ctx, "interno", { bypassGuards: opts?.bypassGuards === true });
    return { enviado: true };
  } catch (e) {
    console.error(
      "[notificacao-interna] erro:",
      e instanceof Error ? e.message : String(e),
    );
    return { enviado: false, motivo: "erro_envio" };
  }
}

export async function notifyOwner(ownerId: string | null, msg: string): Promise<boolean> {
  if (!ownerId) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = await getOwnerPhone(supabaseAdmin, ownerId);
    const chatId = await getOwnerTelegramChatId(supabaseAdmin, ownerId);
    if (!phone && !chatId) return false;
    const r = await enviarNotificacaoInterna(phone, msg, "xerife", { telegramChatId: chatId });
    return r.enviado;
  } catch (e) {
    console.error("[xerife/notify] erro:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function notifyDiretoria(msg: string): Promise<boolean> {
  const phone = (process.env.WHATSAPP_DIRETORIA ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_DIRETORIA ?? "").trim() || null;
  const r = await enviarNotificacaoInterna(phone, msg, "xerife-diretoria", {
    telegramChatId: chatId,
  });
  return r.enviado;
}

/** Caminho pronto para eventos financeiros (sem call site nesta fase). */
export async function notifyFinanceiro(msg: string): Promise<boolean> {
  const phone = (process.env.WHATSAPP_FINANCEIRO ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_FINANCEIRO ?? "").trim() || null;
  const r = await enviarNotificacaoInterna(phone, msg, "xerife-financeiro", {
    telegramChatId: chatId,
  });
  return r.enviado;
}

export function crmLeadLink(leadId: string): string {
  return `https://crm.inplastic.com.br/pipeline?lead=${leadId}`;
}
