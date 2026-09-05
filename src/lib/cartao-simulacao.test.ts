import { describe, expect, it } from "vitest";

import {
  acrescimoEfetivo,
  ehCondicaoCartao,
  fatorCartao,
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
