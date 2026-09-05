/**
 * Comprovação de entrega no pós-venda.
 *
 * Módulo puro (sem rede/banco/React): é a mesma regra usada pela tela
 * (`PedidoDetailDrawer`) e pelo servidor (`confirmarEntregaComprovada`).
 *
 * Decisão importante sobre o modelo de dados:
 *   `pedidos.entrega_confirmada` é TEXT e já era preenchido automaticamente
 *   ("entregue"/"coletado") ao entrar no pós-venda — ou seja, NÃO significa
 *   "entrega comprovada". A comprovação com anexos tem coluna própria,
 *   `pedidos.entrega_comprovada_em` (timestamptz), que é a fonte da verdade.
 */

export const CATEGORIAS_COMPROVACAO = [
  "foto_entrega",
  "canhoto_nf",
  "comprovante_entrega",
] as const;

export type CategoriaComprovacao = (typeof CATEGORIAS_COMPROVACAO)[number];

export const CATEGORIA_COMPROVACAO_LABEL: Record<CategoriaComprovacao, string> = {
  foto_entrega: "Foto da entrega",
  canhoto_nf: "Canhoto da NF assinado",
  comprovante_entrega: "Comprovante / recibo",
};

/** Status do pós-venda gravado quando a entrega é comprovada. */
export const POS_VENDA_STATUS_ENTREGA_COMPROVADA = "entrega_comprovada";

/**
 * Xerife só cobra comprovação de pedidos que entraram em pós-venda a partir
 * daqui (data da migration). Sem isso, os 50 pedidos antigos gerariam
 * 50 tarefas de uma vez.
 */
export const COMPROVACAO_VIGENTE_DESDE = "2026-09-05T00:00:00.000Z";

/** Dedupe da tarefa do Xerife: no máximo 1 cobrança a cada 3 dias por pedido. */
export const COMPROVACAO_DEDUPE_HORAS = 72;

/** Horas em pós-venda sem comprovação antes de o Xerife cobrar. */
export const COMPROVACAO_SLA_HORAS = 48;

export type DocComprovacao = {
  categoria: string;
  removido_em?: string | null;
};

/** Só docs vivos (não arquivados) contam como comprovação. */
function vivos(docs: readonly DocComprovacao[] | null | undefined): DocComprovacao[] {
  return (docs ?? []).filter((d) => !d.removido_em);
}

export function temCategoria(
  docs: readonly DocComprovacao[] | null | undefined,
  ...categorias: string[]
): boolean {
  return vivos(docs).some((d) => categorias.includes(d.categoria));
}

/**
 * Comprovação completa = pelo menos UMA foto da entrega E pelo menos UM
 * documento (canhoto da NF assinado OU comprovante/recibo).
 */
export function comprovacaoCompleta(docs: readonly DocComprovacao[] | null | undefined): {
  ok: boolean;
  faltando: string[];
} {
  const faltando: string[] = [];
  if (!temCategoria(docs, "foto_entrega")) {
    faltando.push(CATEGORIA_COMPROVACAO_LABEL.foto_entrega);
  }
  if (!temCategoria(docs, "canhoto_nf", "comprovante_entrega")) {
    faltando.push("Canhoto da NF assinado ou Comprovante / recibo");
  }
  return { ok: faltando.length === 0, faltando };
}

export type PedidoComprovacao = {
  stage: string;
  entrega_comprovada_em?: string | null;
};

/** Pedido em pós-venda que ainda não teve a entrega comprovada. */
export function precisaComprovacao(pedido: PedidoComprovacao | null | undefined): boolean {
  if (!pedido) return false;
  return pedido.stage === "pos_venda" && !pedido.entrega_comprovada_em;
}

/** Validação de "Recebido por" — nome de quem assinou/recebeu. */
export function recebidoPorValido(v: string | null | undefined): boolean {
  return (v ?? "").trim().length >= 3;
}

/** Data da entrega precisa existir e não pode ser no futuro. */
export function dataEntregaValida(
  iso: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  // tolerância de 1 minuto para relógio do cliente adiantado
  return t <= agora.getTime() + 60_000;
}
