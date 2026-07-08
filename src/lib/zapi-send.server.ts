/**
 * Envio Z-API compartilhado. Único caminho que constrói a URL + headers Z-API,
 * incluindo o header obrigatório `Client-Token` a partir de ZAPI_CLIENT_TOKEN.
 * Usado tanto pelo envio manual (server fn `sendWhatsapp` / `sendConversaMessage`)
 * quanto pelos hooks públicos do n8n (`ia-responder`, `ia-qualificar`).
 */

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

export type ZapiSendResult = {
  ok: boolean;
  status: number;
  body: string;
  phone: string;
};

export async function sendZapiText(
  phoneRaw: string,
  message: string,
  ctx?: string,
): Promise<ZapiSendResult> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const tag = ctx ? `[zapi:${ctx}]` : "[zapi]";

  console.log(
    `${tag} env instance=${!!instanceId}(${instanceId?.length ?? 0}) token=${!!token}(${token?.length ?? 0}) clientToken=${!!clientToken}(${clientToken?.length ?? 0})`,
  );

  if (!instanceId || !token || !clientToken) {
    console.error(
      `${tag} secrets ausentes — instance=${!!instanceId} token=${!!token} clientToken=${!!clientToken}`,
    );
    throw new Error("Z-API não configurado (variáveis ausentes).");
  }

  const phone = normalizePhoneBR(phoneRaw);
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({ phone, message }),
  });
  const body = await res.text();
  console.log(`${tag} send-text status=${res.status} phone=${phone} bodyLen=${body.length}`);
  if (!res.ok) {
    console.error(`${tag} send-text falhou [${res.status}]: ${body}`);
    throw new Error(`Z-API [${res.status}]: ${body}`);
  }
  return { ok: true, status: res.status, body, phone };
}
