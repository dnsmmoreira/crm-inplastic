/**
 * Fluxo operacional de pedidos — etapas, matriz de transições e helpers puros.
 *
 * Módulo puro (sem acesso a banco, sem server functions) para poder ser
 * importado tanto pelo cliente quanto pelos server functions e testado.
 *
 * As etapas antigas (pedido_recebido, em_validacao, aguardando_aprovacao,
 * aprovado_programado, separacao_conferencia, faturado_aguardando_coleta,
 * despachado_transporte, pedido_entregue, concluido) continuam existindo no
 * enum do banco por compatibilidade histórica, mas não são mais colunas do
 * kanban nem destinos válidos de transição.
 */

/** Colunas visíveis do kanban, na ordem do fluxo. */
export const PEDIDO_STAGES = [
  { id: "analise_financeira", label: "Análise Financeira", color: "#f59e0b" },
  { id: "programacao", label: "Programação", color: "#6366f1" },
  { id: "em_producao", label: "Em Produção", color: "#8b5cf6" },
  { id: "pronto", label: "Pronto", color: "#0ea5e9" },
  { id: "faturado_em_rota", label: "Faturado / Em Rota", color: "#14b8a6" },
  { id: "pos_venda", label: "Pós-venda", color: "#16a34a" },
] as const;

/** Status terminal oculto — não é coluna do kanban. */
export const PEDIDO_STAGE_REPROVADO = "reprovado_financeiro" as const;

export const PEDIDO_STAGE_REPROVADO_LABEL = "Reprovado Financeiro";

export type PedidoStageVisivel = (typeof PEDIDO_STAGES)[number]["id"];
export type PedidoStageId = PedidoStageVisivel | typeof PEDIDO_STAGE_REPROVADO;

export const PEDIDO_STAGE_IDS = [
  ...PEDIDO_STAGES.map((s) => s.id),
  PEDIDO_STAGE_REPROVADO,
] as [PedidoStageId, ...PedidoStageId[]];

const STAGE_ORDER: Record<PedidoStageId, number> = {
  analise_financeira: 0,
  programacao: 1,
  em_producao: 2,
  pronto: 3,
  faturado_em_rota: 4,
  pos_venda: 5,
  reprovado_financeiro: 99,
};

export function stageLabel(id: string): string {
  if (id === PEDIDO_STAGE_REPROVADO) return PEDIDO_STAGE_REPROVADO_LABEL;
  return PEDIDO_STAGES.find((s) => s.id === id)?.label ?? id;
}

export function stageColor(id: string): string {
  if (id === PEDIDO_STAGE_REPROVADO) return "#ef4444";
  return PEDIDO_STAGES.find((s) => s.id === id)?.color ?? "#94a3b8";
}

/** Matriz de avanços permitidos. Retornos são tratados por `isBackward`. */
export const ALLOWED_FORWARD: Record<PedidoStageId, PedidoStageId[]> = {
  analise_financeira: ["programacao", "reprovado_financeiro"],
  programacao: ["em_producao"],
  em_producao: ["pronto"],
  pronto: ["faturado_em_rota"],
  faturado_em_rota: ["pos_venda"],
  pos_venda: [],
  reprovado_financeiro: [],
};

export function isBackward(from: PedidoStageId, to: PedidoStageId): boolean {
  return (STAGE_ORDER[to] ?? 0) < (STAGE_ORDER[from] ?? 0);
}

export function isTransitionAllowed(from: PedidoStageId, to: PedidoStageId): boolean {
  if (from === to) return false;
  // Reprovado é alcançável APENAS a partir de análise financeira…
  if (to === PEDIDO_STAGE_REPROVADO) return from === "analise_financeira";
  // …e o único retorno possível é para a análise financeira.
  if (from === PEDIDO_STAGE_REPROVADO) return to === "analise_financeira";
  if (isBackward(from, to)) return true; // exige motivo
  return ALLOWED_FORWARD[from].includes(to);
}

/** Etapas que contam como pedido FECHADO (fora do relatório de abertos). */
export function isPedidoFechado(stage: string, encerradoEm: string | null | undefined): boolean {
  if (stage === PEDIDO_STAGE_REPROVADO) return true;
  if (stage === "pos_venda" && encerradoEm) return true;
  // etapas legadas terminais
  if (stage === "concluido") return true;
  return false;
}

export type ModalidadeEntrega = "coleta" | "entrega_propria";

export const MODALIDADES_ENTREGA: Array<{ id: ModalidadeEntrega; label: string }> = [
  { id: "coleta", label: "Coleta pelo cliente" },
  { id: "entrega_propria", label: "Entrega própria" },
];

export function modalidadeLabel(m: string | null | undefined): string {
  return MODALIDADES_ENTREGA.find((x) => x.id === m)?.label ?? "Coleta pelo cliente";
}

/** Badge do card em pós-venda. */
export function entregaBadgeLabel(
  entregaConfirmada: string | null | undefined,
  modalidade: string | null | undefined,
): "Entregue" | "Coletado" {
  if (entregaConfirmada === "entregue") return "Entregue";
  if (entregaConfirmada === "coletado") return "Coletado";
  return modalidade === "entrega_propria" ? "Entregue" : "Coletado";
}

/* ------------------------------------------------------------------ */
/* Motor de regras de aprovação financeira (puro)                      */
/* ------------------------------------------------------------------ */

export type AprovacaoRota =
  | "valor_alto"
  | "primeira_compra"
  | "dispensado_recorrente"
  | "dispensado_valor_baixo"
  | "excecao_manual"
  | "sem_recorrencia";

export const APROVACAO_ROTA_LABEL: Record<AprovacaoRota, string> = {
  valor_alto: "Valor acima do teto obrigatório",
  primeira_compra: "Primeira compra acima do limite",
  dispensado_valor_baixo: "Primeira compra dentro do limite (dispensado)",
  dispensado_recorrente: "Cliente recorrente (dispensado)",
  excecao_manual: "Exceção manual de recorrência (dispensado)",
  sem_recorrencia: "Cliente sem compra dentro da janela",
};

export type AprovacaoParams = {
  valorObrigatorio: number;
  primeiraCompraValor: number;
  recorrenciaDias: number;
};

export const APROVACAO_PARAMS_PADRAO: AprovacaoParams = {
  valorObrigatorio: 25000,
  primeiraCompraValor: 5000,
  recorrenciaDias: 90,
};

export type AprovacaoEntrada = {
  total: number;
  primeiraCompra: boolean;
  /** Houve pedido faturado/entregue dentro da janela de recorrência? */
  compraNaJanela: boolean;
  recorrenteManual: boolean;
};

export type AprovacaoDecisao = {
  stage: "analise_financeira" | "programacao";
  rota: AprovacaoRota;
};

/**
 * Precedência aprovada pelo Denis:
 *  a) valor > teto obrigatório → análise (sempre)
 *  b) primeira compra e valor > limite de primeira compra → análise
 *  c) primeira compra e valor <= limite → programação (dispensado)
 *  d) recorrente (compra na janela OU exceção manual) → programação
 *  e) sem compra na janela → análise
 */
export function decidirRotaAprovacao(
  e: AprovacaoEntrada,
  p: AprovacaoParams = APROVACAO_PARAMS_PADRAO,
): AprovacaoDecisao {
  if (e.total > p.valorObrigatorio) {
    return { stage: "analise_financeira", rota: "valor_alto" };
  }
  if (e.primeiraCompra) {
    return e.total > p.primeiraCompraValor
      ? { stage: "analise_financeira", rota: "primeira_compra" }
      : { stage: "programacao", rota: "dispensado_valor_baixo" };
  }
  if (e.compraNaJanela) {
    return { stage: "programacao", rota: "dispensado_recorrente" };
  }
  if (e.recorrenteManual) {
    return { stage: "programacao", rota: "excecao_manual" };
  }
  return { stage: "analise_financeira", rota: "sem_recorrencia" };
}
