import { describe, expect, it } from "vitest";
import { agruparPorFaixa, diasParado, faixaParado } from "./faixas-parado";

const AGORA = new Date("2026-06-30T12:00:00.000Z").getTime();
const diasAtras = (d: number) => new Date(AGORA - d * 86400000).toISOString();

describe("diasParado", () => {
  it("retorna 0 para data vazia ou inválida", () => {
    expect(diasParado(null, AGORA)).toBe(0);
    expect(diasParado(undefined, AGORA)).toBe(0);
    expect(diasParado("nao-e-data", AGORA)).toBe(0);
  });

  it("nunca retorna negativo para datas futuras", () => {
    expect(diasParado(new Date(AGORA + 5 * 86400000).toISOString(), AGORA)).toBe(0);
  });

  it("conta dias corridos", () => {
    expect(diasParado(diasAtras(7), AGORA)).toBe(7);
  });
});

describe("faixaParado", () => {
  it("não classifica 0 a 4 dias", () => {
    for (const d of [0, 1, 4]) expect(faixaParado(d)).toBeNull();
  });

  it("classifica as faixas sem sobreposição", () => {
    expect(faixaParado(5)).toBe("atencao");
    expect(faixaParado(14)).toBe("atencao");
    expect(faixaParado(15)).toBe("alerta");
    expect(faixaParado(29)).toBe("alerta");
    expect(faixaParado(30)).toBe("critico");
    expect(faixaParado(400)).toBe("critico");
  });
});

describe("agruparPorFaixa", () => {
  it("soma contagem e valor por faixa, ignorando os saudáveis", () => {
    const itens = [
      { ref: diasAtras(1), v: 100 },
      { ref: diasAtras(6), v: 200 },
      { ref: diasAtras(14), v: 300 },
      { ref: diasAtras(20), v: 400 },
      { ref: diasAtras(90), v: 500 },
    ];
    const r = agruparPorFaixa(
      itens,
      (i) => i.ref,
      (i) => i.v,
      AGORA,
    );
    expect(r.atencao).toEqual({ count: 2, valor: 500 });
    expect(r.alerta).toEqual({ count: 1, valor: 400 });
    expect(r.critico).toEqual({ count: 1, valor: 500 });
  });

  it("funciona sem função de valor", () => {
    const r = agruparPorFaixa([{ ref: diasAtras(40) }], (i) => i.ref, undefined, AGORA);
    expect(r.critico.count).toBe(1);
    expect(r.critico.valor).toBe(0);
  });
});
