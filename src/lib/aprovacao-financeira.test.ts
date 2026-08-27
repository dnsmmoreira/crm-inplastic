import { describe, it, expect } from "vitest";
import { decidirAprovacaoFinanceira } from "./aprovacao-financeira";

const alto = { score: 91, level: "alto" as const, label: "Baixo risco" };
const medio = { score: 58, level: "medio" as const, label: "Risco médio" };
const baixo = { score: 30, level: "baixo" as const, label: "Risco elevado" };

describe("decidirAprovacaoFinanceira — v1", () => {
  it("(1) valor acima de R$ 45 mil sempre requer aprovação, mesmo com score alto e recorrência", () => {
    const d = decidirAprovacaoFinanceira({
      valorTotal: 45000.01,
      pedidosAnteriores: 5,
      score: alto,
    });
    expect(d.requerAprovacao).toBe(true);
    expect(d.regra).toBe("valor_alto");
    expect(d.motivo).toBe(
      "Valor do pedido (R$ 45.000,01) acima de R$ 45 mil sempre requer aprovação do supervisor",
    );
  });

  it("(2) cliente novo (sem pedido anterior) requer aprovação", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 500, pedidosAnteriores: 0, score: alto });
    expect(d.requerAprovacao).toBe(true);
    expect(d.regra).toBe("cliente_novo");
    expect(d.motivo).toBe("Cliente novo — ainda não tem pedido anterior");
  });

  it("(3) score baixo requer aprovação", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 500, pedidosAnteriores: 3, score: baixo });
    expect(d.requerAprovacao).toBe(true);
    expect(d.regra).toBe("score_baixo");
    expect(d.motivo).toBe("Score de risco baixo (30/100 — Risco elevado)");
  });

  it("(4) score médio requer aprovação", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 500, pedidosAnteriores: 3, score: medio });
    expect(d.requerAprovacao).toBe(true);
    expect(d.regra).toBe("score_medio");
    expect(d.motivo).toBe("Score de risco médio (58/100)");
  });

  it("(5) score alto mas valor acima de R$ 10 mil requer aprovação", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 12500, pedidosAnteriores: 2, score: alto });
    expect(d.requerAprovacao).toBe(true);
    expect(d.regra).toBe("valor_medio");
    expect(d.motivo).toBe(
      "Valor do pedido (R$ 12.500,00) acima de R$ 10 mil requer aprovação, mesmo com bom score",
    );
  });

  it("(6) score alto + valor ≤ R$ 10 mil + cliente recorrente dispensa aprovação (com rastro)", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 10000, pedidosAnteriores: 1, score: alto });
    expect(d.requerAprovacao).toBe(false);
    expect(d.regra).toBe("auto_aprovado");
    expect(d.motivo).toBe(
      "Auto-aprovado: score alto (91/100), valor ≤ R$10 mil, cliente recorrente",
    );
  });

  it("prioridade: valor > 45k vence cliente novo e score baixo", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 90000, pedidosAnteriores: 0, score: baixo });
    expect(d.regra).toBe("valor_alto");
  });

  it("prioridade: cliente novo vence score baixo/médio", () => {
    const d = decidirAprovacaoFinanceira({ valorTotal: 100, pedidosAnteriores: 0, score: baixo });
    expect(d.regra).toBe("cliente_novo");
  });
});
