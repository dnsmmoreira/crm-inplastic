/**
 * Envio de e-mail transacional compartilhado (Resend).
 * Único caminho que fala com o provedor de e-mail. Usado pelo Chat Hub do
 * cliente (`sendConversaMessage` com canal="email").
 */

export type EmailSendResult = {
  ok: boolean;
  status: number;
  body: string;
  to: string;
};

export async function sendEmailText(
  to: string,
  subject: string,
  text: string,
  ctx?: string,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "CRM INPLASTIC <onboarding@resend.dev>";
  const tag = ctx ? `[email:${ctx}]` : "[email]";

  if (!apiKey) {
    console.error(`${tag} RESEND_API_KEY ausente`);
    throw new Error(
      "E-mail não configurado. Cadastre o segredo RESEND_API_KEY para enviar por e-mail.",
    );
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Destinatário de e-mail inválido ou ausente no cadastro do cliente.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(
        text,
      )}</div>`,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`${tag} falha status=${res.status} body=${body.slice(0, 500)}`);
    throw new Error(`Falha ao enviar e-mail (${res.status}).`);
  }
  return { ok: true, status: res.status, body, to };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
