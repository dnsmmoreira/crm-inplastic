/**
 * Notificações INTERNAS (vendedores / admins / diretoria).
 * Ponto único de estrangulamento: `enviarNotificacaoInterna`.
 * Usa exclusivamente o canal 'interno' da Z-API (ZAPI_INTERNO_*).
 * NUNCA envia para leads e NUNCA cai nas credenciais comerciais.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient<any, any, any>;

const phoneCache = new Map<string, string | null>();

export type ResultadoNotificacaoInterna = {
  enviado: boolean;
  motivo?: "canal_interno_desligado" | "canal_interno_sem_credencial" | "sem_destino" | "erro_envio";
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
): Promise<ResultadoNotificacaoInterna> {
  try {
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
    await sendZapiText(alvo, texto, ctx, "interno");
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
    if (!phone) return false;
    const r = await enviarNotificacaoInterna(phone, msg, "xerife");
    return r.enviado;
  } catch (e) {
    console.error("[xerife/notify] erro:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function notifyDiretoria(msg: string): Promise<boolean> {
  const phone = (process.env.WHATSAPP_DIRETORIA ?? "").trim();
  const r = await enviarNotificacaoInterna(phone, msg, "xerife-diretoria");
  return r.enviado;
}

export function crmLeadLink(leadId: string): string {
  return `https://crm.inplastic.com.br/pipeline?lead=${leadId}`;
}
