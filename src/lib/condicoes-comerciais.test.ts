import { describe, it, expect } from "vitest";
import {
  descreverParcelas,
  espacamentoIrregular,
  aplicarIntervalo,
  intervaloPredominante,
  percentuaisIguais,
  percentuaisValidos,
  valoresPorPercentual,
  normalizarParcelas,
} from "./condicoes-comerciais";

describe("percentuais", () => {
  it("3 parcelas somam exatamente 100", () => {
    const p = percentuaisIguais(3);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentuaisValidos(p.map((percentual) => ({ percentual })))).toBe(true);
  });

  it("valores por percentual fecham com o total (sobra na última)", () => {
    const v = valoresPorPercentual(1000.01, percentuaisIguais(3));
    expect(+v.reduce((a, b) => a + b, 0).toFixed(2)).toBe(1000.01);
  });
});

describe("descrição gerada", () => {
  it("pix-14: 50% à vista + 50% em 28 dias", () => {
    expect(
      descreverParcelas([
        { dias: 0, percentual: 50 },
        { dias: 28, percentual: 50 },
      ]),
    ).toBe("50% à vista + 50% em 28 dias");
  });

  it("pix-28: 4x de 25%", () => {
    expect(
      descreverParcelas([0, 15, 30, 45].map((dias) => ({ dias, percentual: 25 }))),
    ).toBe("4x de 25% (0/15/30/45 dias)");
  });

  it("parcela única", () => {
    expect(descreverParcelas([{ dias: 0, percentual: 100 }])).toBe("100% à vista");
  });
});

describe("intervalos", () => {
  it("detecta o intervalo predominante", () => {
    expect(intervaloPredominante([0, 30, 60, 90])).toBe(30);
  });
  it("detecta espaçamento irregular", () => {
    expect(espacamentoIrregular([0, 15, 60])).toBe(true);
    expect(espacamentoIrregular([0, 30, 60])).toBe(false);
  });
  it("reaplica intervalo mantendo o primeiro prazo", () => {
    expect(aplicarIntervalo([0, 15, 60], 30)).toEqual([0, 30, 60]);
  });
});

describe("normalização", () => {
  it("cai no fallback de splits quando não há parcelas", () => {
    expect(normalizarParcelas(null, [0, 30])).toEqual([
      { dias: 0, percentual: 50 },
      { dias: 30, percentual: 50 },
    ]);
  });
});
