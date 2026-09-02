/**
 * Regras de aprovação financeira (v1) na geração de pedido a partir de proposta.
 *
 * Lógica PURA e testável — a server fn `gerarPedidoInterno` (src/lib/pedidos-gerar.functions.ts)
 * apenas coleta os insumos (score do lead, valor total dos itens, pedidos anteriores
 * do lead) e delega a decisão para cá. O bypass de admin continua fora daqui:
 * admin gera direto, sem passar por estas regras.
 */

import type { LeadScore } from "@/lib/lead-score";

export const TETO_APROVACAO_OBRIGATORIA = 45_000;
export const TETO_DISPENSA_SCORE_ALTO = 10_000;

export type AprovacaoInput = {
  valorTotal: number;
  pedidosAnteriores: number;
  score: Pick<LeadScore, "score" | "level" | "label">;
};

export type AprovacaoDecisao = {
  requerAprovacao: boolean;
  /** Motivo gravado em `propostas.approval_reason` (também no auto-aprovado, para auditoria). */
  motivo: string;
  /** Chave estável da regra que venceu — útil para testes/telemetria. */
  regra:
    | "valor_alto"
    | "cliente_novo"
    | "score_baixo"
    | "score_medio"
    | "valor_medio"
    | "auto_aprovado";
};

/** Formata como "45.000,00" (o prefixo "R$ " já vem no texto do motivo). */
export function formatarValorBr(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

export function decidirAprovacaoFinanceira(input: AprovacaoInput): AprovacaoDecisao {
  const { valorTotal, pedidosAnteriores, score } = input;

  if (valorTotal > TETO_APROVACAO_OBRIGATORIA) {
    return {
      requerAprovacao: true,
      regra: "valor_alto",
      motivo: `Valor do pedido (R$ ${formatarValorBr(valorTotal)}) acima de R$ 45 mil sempre requer aprovação do supervisor`,
    };
  }

  if (pedidosAnteriores === 0) {
    return {
      requerAprovacao: true,
      regra: "cliente_novo",
      motivo: "Cliente novo — ainda não tem pedido anterior",
    };
  }

  if (score.level === "baixo") {
    return {
      requerAprovacao: true,
      regra: "score_baixo",
      motivo: `Score de risco baixo (${score.score}/100 — ${score.label})`,
    };
  }

  if (score.level === "medio") {
    return {
      requerAprovacao: true,
      regra: "score_medio",
      motivo: `Score de risco médio (${score.score}/100)`,
    };
  }

  if (valorTotal > TETO_DISPENSA_SCORE_ALTO) {
    return {
      requerAprovacao: true,
      regra: "valor_medio",
      motivo: `Valor do pedido (R$ ${formatarValorBr(valorTotal)}) acima de R$ 10 mil requer aprovação, mesmo com bom score`,
    };
  }

  return {
    requerAprovacao: false,
    regra: "auto_aprovado",
    motivo: `Auto-aprovado: score alto (${score.score}/100), valor ≤ R$10 mil, cliente recorrente`,
  };
}
