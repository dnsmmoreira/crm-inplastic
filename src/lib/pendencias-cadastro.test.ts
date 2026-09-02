import { describe, it, expect } from "vitest";
import { faltasDoProduto, diasParado } from "./pendencias-cadastro";

describe("faltasDoProduto", () => {
  it("não aponta nada quando o cadastro está completo", () => {
    expect(faltasDoProduto({ weight_kg: 12, height_cm: 15, width_cm: 100, length_cm: 120 })).toEqual(
      [],
    );
  });

  it("trata null e 0 como não informado", () => {
    expect(faltasDoProduto({ weight_kg: 0, height_cm: null, width_cm: 100, length_cm: 120 })).toEqual([
      "peso",
      "altura",
    ]);
  });

  it("lista todas as faltas na ordem peso→altura→largura→comprimento", () => {
    expect(faltasDoProduto({})).toEqual(["peso", "altura", "largura", "comprimento"]);
  });

  it("ignora valores negativos como inválidos", () => {
    expect(faltasDoProduto({ weight_kg: -1, height_cm: 1, width_cm: 1, length_cm: 1 })).toEqual([
      "peso",
    ]);
  });
});

describe("diasParado", () => {
  const agora = new Date("2026-09-02T12:00:00Z").getTime();

  it("conta dias corridos completos", () => {
    expect(diasParado("2026-08-30T12:00:00Z", agora)).toBe(3);
  });

  it("retorna 0 para data futura, nula ou inválida", () => {
    expect(diasParado("2026-09-10T12:00:00Z", agora)).toBe(0);
    expect(diasParado(null, agora)).toBe(0);
    expect(diasParado("não é data", agora)).toBe(0);
  });
});
