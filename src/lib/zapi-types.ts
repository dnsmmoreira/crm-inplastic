/**
 * Tipos compartilhados do envio de WhatsApp.
 * Extraídos de `whatsapp-send.server.ts` para poderem ser importados por módulos
 * que não são server-only. Nomes mantidos para não quebrar imports existentes.
 */

export type ZapiCanal = "comercial" | "interno";

export type ZapiSendResult = {
  ok: boolean;
  status: number;
  body: string;
  phone: string;
  messageId: string | null;
  zaapId: string | null;
};

/**
 * Origem do envio.
 * - 'iniciado_sistema' (PADRÃO): disparo do próprio CRM (filas, follow-up, régua,
 *   campanhas, pg_cron, n8n) e envio manual de vendedor. Respeita integralmente
 *   a janela 07:00-20:00 e domingos.
 * - 'resposta_inbound': resposta a uma mensagem recebida do cliente. Liberada 24/7.
 * - 'manual_admin': envio manual feito pelo chat do CRM por usuário com papel de
 *   administrador, em conversa que JÁ possui mensagem recebida do cliente. Liberada
 *   24/7. O papel é sempre resolvido no servidor a partir da sessão autenticada.
 * NUNCA inverter o padrão.
 */
export type ZapiOrigem = "iniciado_sistema" | "resposta_inbound" | "manual_admin";
