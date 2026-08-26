/**
 * Envio de e-mail transacional via Resend (conector Lovable, gateway-backed).
 * Server-only: lê LOVABLE_API_KEY e RESEND_API_KEY.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export const REMETENTE_PROPOSTAS = "Inplastic Comercial <propostas@notify.inplastic.com.br>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendResendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada.");
  if (!resendKey) throw new Error("RESEND_API_KEY não configurada.");

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: input.from ?? REMETENTE_PROPOSTAS,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`Resend falhou [${response.status}]: ${body}`);
    throw new Error(`Falha no envio do e-mail [${response.status}]: ${body}`);
  }

  try {
    return JSON.parse(body) as { id: string };
  } catch {
    return { id: "" };
  }
}

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function propostaEmailHtml(p: {
  numero: string;
  cliente: string;
  contato: string;
  total: string;
  validade: string;
  link: string;
  vendedor: string;
  emitente: string;
}) {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px 0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0f172a;padding:24px 32px">
        <div style="color:#ffffff;font-size:18px;font-weight:700">${esc(p.emitente)}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px">Proposta comercial</div>
      </td></tr>
      <tr><td style="padding:28px 32px">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">Proposta nº ${esc(p.numero)}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#334155">
          ${p.contato ? `Olá, ${esc(p.contato)}!` : "Olá!"} Segue a proposta comercial preparada para
          <strong>${esc(p.cliente)}</strong>. Todos os itens, condições e prazos estão disponíveis no link abaixo.
        </p>
        ${p.total ? `<p style="margin:0 0 4px;font-size:14px;color:#334155"><strong>Valor total:</strong> ${esc(p.total)}</p>` : ""}
        ${p.validade ? `<p style="margin:0 0 4px;font-size:14px;color:#334155"><strong>Validade:</strong> ${esc(p.validade)}</p>` : ""}
        <div style="text-align:center;padding:24px 0 8px">
          <a href="${esc(p.link)}" style="background:#2563eb;color:#ffffff;border-radius:8px;font-size:15px;font-weight:600;padding:12px 28px;text-decoration:none;display:inline-block">Ver proposta</a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#64748b;word-break:break-all">
          Se o botão não funcionar, copie e cole este endereço no navegador: ${esc(p.link)}
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px" />
        <p style="margin:0;font-size:12px;color:#64748b">
          ${p.vendedor ? `Qualquer dúvida, fale com ${esc(p.vendedor)}.` : "Qualquer dúvida, estamos à disposição."}
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function propostaEmailText(p: { numero: string; cliente: string; total: string; link: string }) {
  return [
    `Proposta comercial nº ${p.numero} — ${p.cliente}`,
    p.total ? `Valor total: ${p.total}` : "",
    "",
    `Ver proposta: ${p.link}`,
  ]
    .filter(Boolean)
    .join("\n");
}
