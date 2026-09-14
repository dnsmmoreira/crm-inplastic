/**
 * Quem pode mexer em TRATATIVA COMERCIAL de um pedido.
 *
 * Regra de negócio (Denis, 14/09/2026): cliente, condição de pagamento,
 * transportadora, modalidade de entrega, itens e valores são responsabilidade
 * do VENDEDOR, validados no checklist de "Gerar Pedido". O time operacional —
 * mesmo com `pedidos.operar_producao` e `pedidos.movimentar` — só registra
 * datas de produção/entrega/faturamento e observações de logística.
 *
 * Módulo PURO: a UI usa para desabilitar campos e o servidor usa para recusar
 * o update (a trava real está no handler).
 */

export type CampoPedidoComercial =
  | "modalidade_entrega"
  | "transportadora"
  | "cliente"
  | "condicao_pagamento"
  | "itens"
  | "valores"
  | "endereco_entrega";

export const CAMPOS_PEDIDO_COMERCIAIS: readonly CampoPedidoComercial[] = [
  "modalidade_entrega",
  "transportadora",
  "cliente",
  "condicao_pagamento",
  "itens",
  "valores",
  "endereco_entrega",
];

export type CampoPedidoOperacional =
  | "prazo_real_entrega"
  | "previsao_entrega"
  | "fiscal"
  | "checklist"
  | "ocorrencias"
  | "observacoes_logistica";

export const CAMPOS_PEDIDO_OPERACIONAIS: readonly CampoPedidoOperacional[] = [
  "prazo_real_entrega",
  "previsao_entrega",
  "fiscal",
  "checklist",
  "ocorrencias",
  "observacoes_logistica",
];

export function ehCampoComercialPedido(campo: string): boolean {
  return (CAMPOS_PEDIDO_COMERCIAIS as readonly string[]).includes(campo);
}

export type AtorPedido = {
  isAdmin: boolean;
  /** É o vendedor dono do pedido (vendedor_proprietario_id ou owner_id). */
  isVendedorDono: boolean;
};

/**
 * Admin sempre pode; o vendedor dono do pedido pode; qualquer outro papel —
 * inclusive operacional com permissão de movimentar — NÃO pode.
 */
export function podeEditarComercialPedido(ator: AtorPedido): boolean {
  return Boolean(ator.isAdmin || ator.isVendedorDono);
}

export const MSG_SEM_EDICAO_COMERCIAL =
  "Transportadora e modalidade de entrega vêm da negociação: só o vendedor do pedido (ou um administrador) pode alterar.";
