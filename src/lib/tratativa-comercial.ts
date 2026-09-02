/**
 * Regra de processo: a tratativa comercial é obrigatória ANTES de enviar a
 * proposta ao cliente (WhatsApp ou e-mail). É o texto que o financeiro lê na
 * hora de aprovar — sem ele, a aprovação vira adivinhação.
 *
 * Não vale para criação, rascunho, página pública nem geração de pedido.
 * Admin também não é isento: a regra é de processo, não de permissão.
 */

export const TRATATIVA_MIN_CHARS = 20;

export const MSG_TRATATIVA_OBRIGATORIA =
  "Registre a tratativa comercial antes de enviar — o financeiro usa isso na aprovação";

/** `true` quando a tratativa tem conteúdo suficiente para liberar o envio. */
export function tratativaValida(texto: string | null | undefined): boolean {
  return String(texto ?? "").trim().length >= TRATATIVA_MIN_CHARS;
}
