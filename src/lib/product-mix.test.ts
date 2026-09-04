import { describe, it, expect } from "vitest";
import {
  agregarMixProdutos,
  normalizarNomeProduto,
  truncarRotulo,
  OUTROS_LABEL,
} from "./product-mix";

describe("normalizarNomeProduto", () => {
  it("faz trim, colapsa espaços e minúsculas", () => {
    expect(normalizarNomeProduto("  Pallet   Higiênico ")).toBe("pallet higiênico");
    expect(normalizarNomeProduto(null)).toBe("");
  });
});

describe("truncarRotulo", () => {
  it("trunca acima do máximo", () => {
    expect(truncarRotulo("abc", 10)).toBe("abc");
    expect(truncarRotulo("a".repeat(40)).length).toBe(32);
  });
});

describe("agregarMixProdutos", () => {
  it("agrupa por nome normalizado", () => {
    const r = agregarMixProdutos([
      { product: "Pallet  Higiênico", valor: 10 },
      { product: "pallet higiênico ", valor: 5 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(15);
  });

  it("prefere productId quando existir", () => {
    const r = agregarMixProdutos([
      { product: "Caixa A", productId: "p1", valor: 10 },
      { product: "Caixa A (variação longa)", productId: "p1", valor: 4 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].value).toBe(14);
  });

  it("ignora entradas sem produto", () => {
    expect(agregarMixProdutos([{ product: "   ", valor: 99 }])).toEqual([]);
  });

  it("limita a top 6 + Outros", () => {
    const entradas = Array.from({ length: 20 }, (_, i) => ({
      product: `Produto ${i}`,
      valor: i + 1,
    }));
    const r = agregarMixProdutos(entradas);
    expect(r).toHaveLength(7);
    expect(r[r.length - 1].name).toBe(OUTROS_LABEL);
    const total = entradas.reduce((s, e) => s + e.valor, 0);
    expect(r.reduce((s, f) => s + f.value, 0)).toBe(total);
  });

  it("não cria Outros quando cabe tudo", () => {
    const r = agregarMixProdutos(
      Array.from({ length: 7 }, (_, i) => ({ product: `P${i}`, valor: 1 })),
    );
    expect(r).toHaveLength(7);
    expect(r.some((f) => f.name === OUTROS_LABEL)).toBe(false);
  });
});
