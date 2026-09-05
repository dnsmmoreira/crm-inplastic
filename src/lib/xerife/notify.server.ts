/**
 * Notificações INTERNAS (vendedores / admins / diretoria).
 * Ponto único de estrangulamento: `enviarNotificacaoInterna`.
 * Usa exclusivamente o Telegram para alertas internos.
 * NUNCA envia para leads e NUNCA cai nas credenciais comerciais.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>;

const phoneCache = new Map<string, string | null>();
const telegramChatCache = new Map<string, string | null>();
const nomeCache = new Map<string, string | null>();

export type DestinatarioInterno = {
  tipo: "usuario" | "diretoria" | "financeiro";
  userId?: string;
  nome?: string;
};

export async function getOwnerTelegram(
  sb: SB,
  ownerId: string,
): Promise<{ chatId: string | null; nome: string | null }> {
  if (telegramChatCache.has(ownerId)) {
    return { chatId: telegramChatCache.get(ownerId)!, nome: nomeCache.get(ownerId) ?? null };
  }
  const { data } = await sb
    .from("profiles")
    .select("telegram_chat_id, name")
    .eq("id", ownerId)
    .maybeSingle();
  const c = ((data?.telegram_chat_id ?? "") as string).trim() || null;
  const n = ((data?.name ?? "") as string).trim() || null;
  telegramChatCache.set(ownerId, c);
  nomeCache.set(ownerId, n);
  return { chatId: c, nome: n };
}

export async function getOwnerTelegramChatId(sb: SB, ownerId: string): Promise<string | null> {
  return (await getOwnerTelegram(sb, ownerId)).chatId;
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

/**
 * Texto explícito do motivo pelo qual o alerta não chegou a ninguém.
 * NUNCA registra valores de variáveis — apenas nomes/identificação humana.
 */
function detalheNaoEntregue(
  motivo: "token" | "destino",
  destinatario?: DestinatarioInterno | null,
): string {
  if (motivo === "token") return "TELEGRAM_BOT_TOKEN ausente";
  switch (destinatario?.tipo) {
    case "usuario":
      return `Usuário ${destinatario.nome?.trim() || destinatario.userId || "desconhecido"} sem Telegram vinculado`;
    case "financeiro":
      return "Variável TELEGRAM_CHAT_FINANCEIRO ausente";
    case "diretoria":
      return "Variável TELEGRAM_CHAT_DIRETORIA ausente";
    default:
      return "Nenhum canal interno configurado";
  }
}

/**
 * (C) Rastreio: quando não há canal interno configurado, o alerta não chega em
 * ninguém. Grava em `zapi_alertas` para ficar visível no painel. Nunca lança e
 * NUNCA registra valores de variáveis. Dedupe: no máximo 1x a cada 24h por
 * (tipo + detalhe).
 */
async function registrarAlertaNaoEntregue(canal: string, detalhe: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const jaExiste = await supabaseAdmin
      .from("zapi_alertas")
      .select("id")
      .eq("tipo", "alerta_nao_entregue")
      .eq("detalhe", detalhe)
      .gte("created_at", desde)
      .limit(1);
    if (jaExiste?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("xerife.notificacao/dedupe-alerta", jaExiste.error, { canal });
    } else if ((jaExiste?.data ?? []).length > 0) {
      return;
    }
    // REGISTRAR E SEGUIR: rastreio de alerta não entregue; nunca lança.
    const ins = await supabaseAdmin.from("zapi_alertas").insert({
      canal,
      tipo: "alerta_nao_entregue",
      detalhe,
    });
    if (ins?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("xerife.notificacao/alerta-nao-entregue", ins.error, { canal });
    }
  } catch (e) {
    console.error(
      "[notificacao-interna] falha ao registrar alerta_nao_entregue:",
      e instanceof Error ? e.message : String(e),
    );
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("xerife.notificacao", e, {
      canal,
      acao: "registrar_alerta_nao_entregue",
      detalhe,
    });
  }
}


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
  opts?: {
    telegramChatId?: string | null;
    bypassGuards?: boolean;
    destinatario?: DestinatarioInterno;
  },
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
          await registrarAlertaNaoEntregue(ctx, detalheNaoEntregue("token", opts?.destinatario));
          return { enviado: false, motivo: "telegram_sem_token" };
        }
        const chatId = (opts?.telegramChatId ?? "").trim();
        if (!chatId) {
          await registrarAlertaNaoEntregue(ctx, detalheNaoEntregue("destino", opts?.destinatario));
          return { enviado: false, motivo: "sem_chat_id" };
        }
        const { sendTelegramText } = await import("@/lib/telegram-send.server");
        const tg = await sendTelegramText(chatId, texto, ctx);
        return tg.ok ? { enviado: true } : { enviado: false, motivo: "erro_envio" };
      }
    }

    // Fora do Telegram não existe mais canal interno: a Z-API foi removida e
    // o número comercial da Cloud API não é usado para alertas internos.
    void destino;
    console.warn(
      "[notificacao-interna] Telegram inativo/indisponível — nada enviado (sem fallback WhatsApp).",
    );
    await registrarAlertaNaoEntregue(
      ctx,
      (opts?.telegramChatId ?? "").trim()
        ? "Nenhum canal interno configurado"
        : detalheNaoEntregue("destino", opts?.destinatario),
    );
    return { enviado: false, motivo: "canal_interno_desligado" };
  } catch (e) {
    console.error("[notificacao-interna] erro:", e instanceof Error ? e.message : String(e));
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("xerife.notificacao", e, { canal: ctx, acao: "envio_interno" });
    return { enviado: false, motivo: "erro_envio" };
  }
}

export async function notifyOwner(ownerId: string | null, msg: string): Promise<boolean> {
  if (!ownerId) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = await getOwnerPhone(supabaseAdmin, ownerId);
    const { chatId, nome } = await getOwnerTelegram(supabaseAdmin, ownerId);
    if (!phone && !chatId) return false;
    const r = await enviarNotificacaoInterna(phone, msg, "xerife", {
      telegramChatId: chatId,
      destinatario: { tipo: "usuario", userId: ownerId, nome: nome ?? undefined },
    });
    return r.enviado;
  } catch (e) {
    console.error("[xerife/notify] erro:", e instanceof Error ? e.message : String(e));
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("xerife.notificacao", e, { user_id: ownerId, acao: "notify_owner" });
    return false;
  }
}

export async function notifyDiretoria(msg: string): Promise<boolean> {
  const phone = (process.env.WHATSAPP_DIRETORIA ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_DIRETORIA ?? "").trim() || null;
  const r = await enviarNotificacaoInterna(phone, msg, "xerife-diretoria", {
    telegramChatId: chatId,
    destinatario: { tipo: "diretoria" },
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
