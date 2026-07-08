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
    const { sendZapiText } = await import("./zapi-send.server");
    const res = await sendZapiText(data.phone, data.message, "sendWhatsapp");
    let parsed: unknown = null;
    try { parsed = JSON.parse(res.body); } catch { /* ignore */ }
    return { ok: true, response: parsed ?? res.body };
  });

/**
 * Verifica o estado da instância Z-API (conectado, phone, etc).
 */
export const zapiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;
    if (!instanceId || !token || !clientToken) {
      return { configured: false, raw: "" };
    }
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
    const res = await fetch(url, { headers: { "Client-Token": clientToken } });
    const raw = await res.text();
    return { configured: true, status: res.status, raw };
  });
