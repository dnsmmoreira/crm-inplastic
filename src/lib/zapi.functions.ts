import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendSchema = z.object({
  phone: z.string().min(8),
  message: z.string().min(1).max(4096),
});

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

/**
 * Envia mensagem de texto via Z-API para o número informado.
 * Requer autenticação (qualquer usuário do CRM).
 */
export const sendWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sendSchema.parse(data))
  .handler(async ({ data }) => {
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;
    if (!instanceId || !token || !clientToken) {
      throw new Error("Z-API não configurado (variáveis ausentes).");
    }
    let phone = onlyDigits(data.phone);
    if (!phone.startsWith("55") && phone.length <= 11) phone = `55${phone}`;
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone, message: data.message }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Z-API send-text falhou [${res.status}]: ${body}`);
      throw new Error(`Z-API [${res.status}]: ${body}`);
    }
    let parsed: unknown = null;
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    return { ok: true, response: parsed ?? body };
  });

/**
 * Verifica o estado da instância Z-API (conectado, phone, etc).
 */
export const zapiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;
    if (!instanceId || !token || !clientToken) {
      return { configured: false as const };
    }
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
    const res = await fetch(url, { headers: { "Client-Token": clientToken } });
    const body = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }
    return { configured: true as const, status: res.status, data: parsed };
  });
