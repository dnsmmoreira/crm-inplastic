/**
 * Regras puras da comprovação de entrega no Pós-venda.
 *
 * Um pedido só é encerrado quando existe PROVA da entrega: pelo menos uma foto
 * E pelo menos um documento (canhoto da NF assinado ou comprovante/recibo).
 * A coluna antiga `pedidos.entrega_confirmada` é preenchida automaticamente
 * pelo fluxo de etapas e NÃO vale como prova — a fonte da verdade é
 * `pedidos.entrega_comprovada_em`.
 *
 * Sem acesso a rede/banco — é o que os testes cobrem.
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

/** Valor de `pedidos.pos_venda_status` gravado ao comprovar a entrega. */
export const POS_VENDA_STATUS_ENTREGA_COMPROVADA = "concluido";

type DocLike = { categoria: string; removido_em?: string | null };

function ativos(docs: readonly DocLike[] | null | undefined): DocLike[] {
  return (docs ?? []).filter((d) => !d.removido_em);
}

/** Existe anexo ativo em alguma das categorias informadas. */
export function temCategoria(
  docs: readonly DocLike[] | null | undefined,
  ...categorias: string[]
): boolean {
  return ativos(docs).some((d) => categorias.includes(d.categoria));
}

/** Completa quando há foto E (canhoto OU comprovante). */
export function comprovacaoCompleta(docs: readonly DocLike[] | null | undefined): {
  ok: boolean;
  faltando: string[];
} {
  const faltando: string[] = [];
  if (!temCategoria(docs, "foto_entrega")) {
    faltando.push(CATEGORIA_COMPROVACAO_LABEL.foto_entrega);
  }
  if (!temCategoria(docs, "canhoto_nf", "comprovante_entrega")) {
    faltando.push(
      `${CATEGORIA_COMPROVACAO_LABEL.canhoto_nf} ou ${CATEGORIA_COMPROVACAO_LABEL.comprovante_entrega}`,
    );
  }
  return { ok: faltando.length === 0, faltando };
}

/** Pedido no Pós-venda que ainda não teve a entrega comprovada. */
export function precisaComprovacao(
  pedido: { stage?: string | null; entrega_comprovada_em?: string | null } | null | undefined,
): boolean {
  if (!pedido) return false;
  return pedido.stage === "pos_venda" && !pedido.entrega_comprovada_em;
}

export function recebidoPorValido(nome: string | null | undefined): boolean {
  return (nome ?? "").trim().length >= 3;
}

export function dataEntregaValida(
  valor: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!valor) return false;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= agora.getTime();
}
