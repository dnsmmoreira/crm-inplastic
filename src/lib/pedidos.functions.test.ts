import { describe, it, expect } from "vitest";
import {
  PEDIDO_STAGES,
  PEDIDO_STAGE_REPROVADO,
  ALLOWED_FORWARD,
  isBackward,
  isTransitionAllowed,
  isPedidoFechado,
  entregaBadgeLabel,
  decidirRotaAprovacao,
  APROVACAO_PARAMS_PADRAO,
} from "./pedidos-stages";

describe("PEDIDO_STAGES", () => {
  it("possui as 7 colunas do fluxo novo na ordem correta", () => {
    expect(PEDIDO_STAGES.map((s) => s.id)).toEqual([
      "analise_financeira",
      "aguardando_pagamento",
      "programacao",
      "em_producao",
      "pronto",
      "faturado_em_rota",
      "pos_venda",
    ]);
  });

  it("reprovado_financeiro não é coluna do kanban", () => {
    expect(PEDIDO_STAGES.some((s) => (s.id as string) === PEDIDO_STAGE_REPROVADO)).toBe(false);
  });
});

describe("ALLOWED_FORWARD — fluxo linear", () => {
  it("avança etapa a etapa", () => {
    expect(isTransitionAllowed("analise_financeira", "programacao")).toBe(true);
    expect(isTransitionAllowed("analise_financeira", "aguardando_pagamento")).toBe(true);
    expect(isTransitionAllowed("aguardando_pagamento", "programacao")).toBe(true);
    expect(isTransitionAllowed("aguardando_pagamento", PEDIDO_STAGE_REPROVADO)).toBe(true);
    expect(isTransitionAllowed("programacao", "em_producao")).toBe(true);
    expect(isTransitionAllowed("em_producao", "pronto")).toBe(true);
    expect(isTransitionAllowed("pronto", "faturado_em_rota")).toBe(true);
    expect(isTransitionAllowed("faturado_em_rota", "pos_venda")).toBe(true);
  });

  it("pular etapas é recusado", () => {
    expect(isTransitionAllowed("analise_financeira", "em_producao")).toBe(false);
    expect(isTransitionAllowed("programacao", "pronto")).toBe(false);
    expect(isTransitionAllowed("em_producao", "faturado_em_rota")).toBe(false);
  });

  it("pos_venda é terminal (nenhum avanço)", () => {
    expect(ALLOWED_FORWARD.pos_venda).toEqual([]);
  });

  it("isTransitionAllowed(x, x) === false", () => {
    for (const s of PEDIDO_STAGES) expect(isTransitionAllowed(s.id, s.id)).toBe(false);
  });
});

describe("Retornos", () => {
  it("retorno para etapa anterior é permitido (exige motivo na server fn)", () => {
    expect(isBackward("em_producao", "programacao")).toBe(true);
    expect(isTransitionAllowed("faturado_em_rota", "analise_financeira")).toBe(true);
  });

  it("isBackward é falso para avanços e mesma etapa", () => {
    expect(isBackward("programacao", "em_producao")).toBe(false);
    expect(isBackward("pronto", "pronto")).toBe(false);
  });
});

describe("reprovado_financeiro", () => {
  it("só é alcançável a partir de analise_financeira", () => {
    expect(isTransitionAllowed("analise_financeira", PEDIDO_STAGE_REPROVADO)).toBe(true);
    expect(isTransitionAllowed("programacao", PEDIDO_STAGE_REPROVADO)).toBe(false);
    expect(isTransitionAllowed("pos_venda", PEDIDO_STAGE_REPROVADO)).toBe(false);
  });

  it("só volta para analise_financeira", () => {
    expect(isTransitionAllowed(PEDIDO_STAGE_REPROVADO, "analise_financeira")).toBe(true);
    expect(isTransitionAllowed(PEDIDO_STAGE_REPROVADO, "programacao")).toBe(false);
    expect(isTransitionAllowed(PEDIDO_STAGE_REPROVADO, "pos_venda")).toBe(false);
  });
});

describe("isPedidoFechado", () => {
  it("reprovado é sempre fechado", () => {
    expect(isPedidoFechado(PEDIDO_STAGE_REPROVADO, null)).toBe(true);
  });
  it("pos_venda só fecha com encerrado_em", () => {
    expect(isPedidoFechado("pos_venda", null)).toBe(false);
    expect(isPedidoFechado("pos_venda", "2026-01-01T00:00:00Z")).toBe(true);
  });
  it("etapas em andamento seguem abertas", () => {
    expect(isPedidoFechado("faturado_em_rota", null)).toBe(false);
    expect(isPedidoFechado("em_producao", null)).toBe(false);
  });
});

describe("entregaBadgeLabel", () => {
  it("usa o registro explícito quando existe", () => {
    expect(entregaBadgeLabel("entregue", "coleta")).toBe("Entregue");
    expect(entregaBadgeLabel("coletado", "entrega_propria")).toBe("Coletado");
  });
  it("cai na modalidade quando não há registro", () => {
    expect(entregaBadgeLabel(null, "entrega_propria")).toBe("Entregue");
    expect(entregaBadgeLabel(null, "coleta")).toBe("Coletado");
  });
});

describe("Motor de regras de aprovação financeira", () => {
  const p = APROVACAO_PARAMS_PADRAO;

  it("(a) valor acima do teto obrigatório sempre vai para análise", () => {
    expect(
      decidirRotaAprovacao(
        { total: 30000, primeiraCompra: false, compraNaJanela: true, recorrenteManual: true },
        p,
      ),
    ).toEqual({ stage: "analise_financeira", rota: "valor_alto" });
  });

  it("(b) primeira compra acima do limite vai para análise", () => {
    expect(
      decidirRotaAprovacao(
        { total: 8000, primeiraCompra: true, compraNaJanela: false, recorrenteManual: false },
        p,
      ),
    ).toEqual({ stage: "analise_financeira", rota: "primeira_compra" });
  });

  it("(c) primeira compra dentro do limite é dispensada", () => {
    expect(
      decidirRotaAprovacao(
        { total: 3000, primeiraCompra: true, compraNaJanela: false, recorrenteManual: false },
        p,
      ),
    ).toEqual({ stage: "programacao", rota: "dispensado_valor_baixo" });
  });

  it("(d) cliente recorrente dentro da janela é dispensado", () => {
    expect(
      decidirRotaAprovacao(
        { total: 20000, primeiraCompra: false, compraNaJanela: true, recorrenteManual: false },
        p,
      ),
    ).toEqual({ stage: "programacao", rota: "dispensado_recorrente" });
  });

  it("exceção manual dispensa quando não há compra na janela", () => {
    expect(
      decidirRotaAprovacao(
        { total: 20000, primeiraCompra: false, compraNaJanela: false, recorrenteManual: true },
        p,
      ),
    ).toEqual({ stage: "programacao", rota: "excecao_manual" });
  });

  it("(e) cliente parado além da janela volta para análise", () => {
    expect(
      decidirRotaAprovacao(
        { total: 20000, primeiraCompra: false, compraNaJanela: false, recorrenteManual: false },
        p,
      ),
    ).toEqual({ stage: "analise_financeira", rota: "sem_recorrencia" });
  });

  it("a regra de valor obrigatório vence a exceção manual", () => {
    const r = decidirRotaAprovacao(
      { total: 25000.01, primeiraCompra: false, compraNaJanela: true, recorrenteManual: true },
      p,
    );
    expect(r.stage).toBe("analise_financeira");
  });
});
