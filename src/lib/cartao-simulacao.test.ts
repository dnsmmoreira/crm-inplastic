import { describe, expect, it } from "vitest";

import {
  acrescimoEfetivo,
  ehCondicaoCartao,
  fatorCartao,
  fatorCartaoOperadora,
  gerarParcelasCartao,
  simularCartao,
  valoresParcelasCartao,
} from "./cartao-simulacao";

describe("fatorCartao", () => {
  it("1x não tem acréscimo", () => {
    expect(fatorCartao(1, 3)).toBe(1);
  });
  it("2x com 3% = 1,03", () => {
    expect(+fatorCartao(2, 3).toFixed(4)).toBe(1.03);
  });
  it("12x com 3% compostos ≈ 1,3842", () => {
    expect(+fatorCartao(12, 3).toFixed(4)).toBe(1.3842);
  });
  it("juros simples somam linearmente", () => {
    expect(+fatorCartao(12, 3, false).toFixed(4)).toBe(1.33);
  });
});

describe("modelo com taxa base (5% na 1x + 1,5% composto por parcela adicional)", () => {
  const esperado: Record<number, number> = {
    1: 5.0,
    2: 6.575,
    3: 8.1736,
    4: 9.7962,
    5: 11.4432,
    6: 13.1148,
    7: 14.8115,
    8: 16.5337,
    9: 18.2817,
    10: 20.0559,
    11: 21.8568,
    12: 23.6846,
  };

  it("o fator bate com a tabela oficial (4 casas)", () => {
    for (const [n, pct] of Object.entries(esperado)) {
      const fator = fatorCartao(Number(n), 1.5, true, 5);
      expect(+((fator - 1) * 100).toFixed(4)).toBe(pct);
    }
  });

  it("simularCartao aplica a base já na 1x", () => {
    const linhas = simularCartao({
      valorBase: 1000,
      taxaPercent: 1.5,
      maxParcelas: 12,
      taxaBasePercent: 5,
    });
    expect(linhas[0].acrescimoPercent).toBe(5);
    expect(linhas[0].total).toBe(1050);
    expect(linhas[11].acrescimoPercent).toBe(23.68);
  });

  it("sem taxa base, mantém o comportamento antigo", () => {
    expect(fatorCartao(3, 3, true, 0)).toBe(fatorCartao(3, 3));
    expect(fatorCartao(1, 3, true, 0)).toBe(1);
  });

  it("juros simples também partem da base", () => {
    expect(+fatorCartao(3, 1.5, false, 5).toFixed(4)).toBe(+(1.05 * 1.03).toFixed(4));
  });
});

describe("simularCartao", () => {
  const linhas = simularCartao({ valorBase: 1000, taxaPercent: 3, maxParcelas: 12 });

  it("gera uma linha por parcela", () => {
    expect(linhas).toHaveLength(12);
    expect(linhas[0].acrescimoPercent).toBe(0);
    expect(linhas[0].total).toBe(1000);
  });

  it("a soma das parcelas bate com o total", () => {
    for (const l of linhas) {
      const valores = valoresParcelasCartao(l.total, l.parcelas);
      const soma = +valores.reduce((a, b) => a + b, 0).toFixed(2);
      expect(soma).toBe(l.total);
    }
  });

  it("taxa zero deixa todos os totais iguais", () => {
    const semTaxa = simularCartao({ valorBase: 500, taxaPercent: 0, maxParcelas: 6 });
    expect(semTaxa.every((l) => l.total === 500 && l.acrescimoPercent === 0)).toBe(true);
  });
});

describe("gerarParcelasCartao", () => {
  it("percentuais somam 100 e dias avançam de 30 em 30", () => {
    const p = gerarParcelasCartao(3);
    expect(p.map((x) => x.dias)).toEqual([0, 30, 60]);
    expect(+p.reduce((s, x) => s + x.percentual, 0).toFixed(2)).toBe(100);
  });
});

describe("ehCondicaoCartao / acrescimoEfetivo", () => {
  it("só cartão parcelável", () => {
    expect(ehCondicaoCartao({ method: "Cartão", maxParcelas: 12 })).toBe(true);
    expect(ehCondicaoCartao({ method: "Cartão", maxParcelas: null })).toBe(false);
    expect(ehCondicaoCartao({ method: "Boleto", maxParcelas: 12 })).toBe(false);
  });

  it("no cartão vale o que está na proposta; fora dele, o catálogo", () => {
    expect(acrescimoEfetivo(0, 3, true)).toBe(0);
    expect(acrescimoEfetivo(9.27, 3, true)).toBe(9.27);
    expect(acrescimoEfetivo(0, 5, false)).toBe(5);
  });
});

describe("tabela da operadora (fator = 1 + taxa, juros ao cliente)", () => {
  const TABELA = { "1": 4.98, "2": 9.64, "3": 11.23, "4": 11.36, "5": 14.31, "6": 14.32, "7": 16.72, "8": 16.72, "9": 19.69, "10": 20.65 };

  it("3x com 11,23%: fator 1,1123 e acréscimo exibido 11,23%", () => {
    const f = fatorCartaoOperadora(3, TABELA)!;
    expect(f).toBeCloseTo(1.1123, 12);
    const l = simularCartao({ valorBase: 100, taxaPercent: 0, maxParcelas: 10, taxasOperadora: TABELA });
    expect(l[2].acrescimoPercent).toBe(11.23);
    expect(l[2].taxaOperadoraPercent).toBe(11.23);
  });

  it("caso real da operadora: R$ 10.567,20 em 3x → parcela R$ 3.917,97, total R$ 11.753,91", () => {
    const l = simularCartao({ valorBase: 10567.2, taxaPercent: 0, maxParcelas: 10, taxasOperadora: TABELA });
    const tres = l.find((x) => x.parcelas === 3)!;
    expect(tres.valorParcela).toBe(3917.97);
    expect(tres.total).toBe(11753.91);
    expect(tres.acrescimoPercentExato).toBe(11.230127);
    expect(+(10567.2 * (1 + tres.acrescimoPercentExato / 100)).toFixed(2)).toBe(11753.91);
  });

  it("7x e 8x têm o mesmo fator", () => {
    expect(fatorCartaoOperadora(7, TABELA)).toBe(fatorCartaoOperadora(8, TABELA));
  });

  it("parcela fora da tabela é recusada", () => {
    expect(fatorCartaoOperadora(11, TABELA)).toBeNull();
    expect(fatorCartaoOperadora(12, TABELA)).toBeNull();
    const l = simularCartao({ valorBase: 1000, taxaPercent: 1.5, maxParcelas: 12, taxaBasePercent: 5, taxasOperadora: TABELA });
    expect(l.map((x) => x.parcelas)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const buraco = simularCartao({ valorBase: 1000, taxaPercent: 0, maxParcelas: 3, taxasOperadora: { "1": 5, "3": 10 } });
    expect(buraco.map((x) => x.parcelas)).toEqual([1, 3]);
  });

  it("condição sem tabela continua na fórmula antiga, com os valores de hoje", () => {
    for (const semTabela of [undefined, null, {}]) {
      const l = simularCartao({ valorBase: 1000, taxaPercent: 1.5, maxParcelas: 12, taxaBasePercent: 5, taxasOperadora: semTabela });
      expect(l).toHaveLength(12);
      expect(l.map((x) => x.acrescimoPercent)).toEqual([5, 6.57, 8.17, 9.8, 11.44, 13.11, 14.81, 16.53, 18.28, 20.06, 21.86, 23.68]);
      expect(l[0].taxaOperadoraPercent).toBeNull();
    }
    expect(fatorCartao(3, 1.5, true, 5)).toBeCloseTo(1.05 * 1.015 ** 2, 12);
  });

  it("imprime a tabela 1x–10x", () => {
    const l = simularCartao({ valorBase: 10000, taxaPercent: 0, maxParcelas: 10, taxasOperadora: TABELA });
    console.log("TABELA\n" + l.map((x) => `${x.parcelas}x | taxa ${x.taxaOperadoraPercent}% | acrésc ${x.acrescimoPercent}% | total ${x.total}`).join("\n"));
  });
});
