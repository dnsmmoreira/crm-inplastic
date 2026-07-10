/**
 * Notificações do Xerife via Z-API.
 * Reusa o helper compartilhado `sendZapiText` (mesmo canal do envio manual).
 * NUNCA envia para leads — apenas vendedores/admins/diretoria.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient<any, any, any>;

const phoneCache = new Map<string, string | null>();

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

export async function notifyOwner(ownerId: string | null, msg: string): Promise<boolean> {
  if (!ownerId) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const phone = await getOwnerPhone(supabaseAdmin, ownerId);
  if (!phone) return false;
  try {
    const { sendZapiText } = await import("@/lib/zapi-send.server");
    await sendZapiText(phone, msg, "xerife");
    return true;
  } catch (e) {
    console.error("[xerife/notify] erro:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function notifyDiretoria(msg: string): Promise<boolean> {
  const phone = (process.env.WHATSAPP_DIRETORIA ?? "").trim();
  if (!phone) return false;
  try {
    const { sendZapiText } = await import("@/lib/zapi-send.server");
    await sendZapiText(phone, msg, "xerife");
    return true;
  } catch (e) {
    console.error("[xerife/notify diretoria] erro:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function crmLeadLink(leadId: string): string {
  return `https://crm.inplastic.com.br/pipeline?lead=${leadId}`;
}
