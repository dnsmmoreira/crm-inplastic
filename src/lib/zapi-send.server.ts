/**
 * DEPRECATED — Z-API desativada.
 *
 * Este arquivo existe apenas para não quebrar os imports existentes. Toda a
 * lógica de envio vive em `whatsapp-send.server.ts`, que fala exclusivamente
 * com a WhatsApp Cloud API oficial da Meta.
 */
export {
  sendZapiText,
  sendWhatsappText,
  mascararTelefoneLog,
  normalizarTexto,
  janelaAtendimentoAberta,
} from "./whatsapp-send.server";

export type { ZapiCanal, ZapiOrigem, ZapiSendResult } from "./zapi-types";
