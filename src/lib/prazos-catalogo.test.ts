import { describe, it, expect } from "vitest";
import { percentuaisIguais, somaPercentuais } from "./condicoes-comerciais";

/**
 * Catálogo de prazos cadastrado na migration (37 linhas em `condicoes_pagamento`).
 * O teste protege as duas regras do dono: soma exata de 100% e nenhum dia > 90.
 */
export const PRAZOS_CATALOGO: Array<{ id: string; label: string; dias: number[] }> = [
  { id: "p-avista", label: "À vista", dias: [0] },
  { id: "p-ato-7", label: "Ato + 7", dias: [0, 7] },
  { id: "p-ato-7-14", label: "Ato + 7 + 14", dias: [0, 7, 14] },
  { id: "p-ato-7-14-21", label: "Ato + 7 + 14 + 21", dias: [0, 7, 14, 21] },
  { id: "p-ato-7-14-21-28", label: "Ato + 7 + 14 + 21 + 28", dias: [0, 7, 14, 21, 28] },
  { id: "p-ato-15", label: "Ato + 15", dias: [0, 15] },
  { id: "p-ato-15-30", label: "Ato + 15 + 30", dias: [0, 15, 30] },
  { id: "p-ato-15-30-45", label: "Ato + 15 + 30 + 45", dias: [0, 15, 30, 45] },
  { id: "p-7", label: "7", dias: [7] },
  { id: "p-7-14", label: "7 + 14", dias: [7, 14] },
  { id: "p-7-14-21", label: "7 + 14 + 21", dias: [7, 14, 21] },
  { id: "p-7-14-21-28", label: "7 + 14 + 21 + 28", dias: [7, 14, 21, 28] },
  { id: "p-15", label: "15", dias: [15] },
  { id: "p-15-30", label: "15 + 30", dias: [15, 30] },
  { id: "p-15-30-45", label: "15 + 30 + 45", dias: [15, 30, 45] },
  { id: "p-28", label: "28", dias: [28] },
  { id: "p-34", label: "34", dias: [34] },
  { id: "p-40", label: "40", dias: [40] },
  { id: "p-46", label: "46", dias: [46] },
  { id: "p-52", label: "52", dias: [52] },
  { id: "p-58", label: "58", dias: [58] },
  { id: "p-60", label: "60", dias: [60] },
  { id: "p-75", label: "75", dias: [75] },
  { id: "p-90", label: "90", dias: [90] },
  { id: "p-28-34", label: "28 + 34", dias: [28, 34] },
  { id: "p-28-34-40", label: "28 + 34 + 40", dias: [28, 34, 40] },
  { id: "p-28-34-46", label: "28 + 34 + 46", dias: [28, 34, 46] },
  { id: "p-28-34-46-52", label: "28 + 34 + 46 + 52", dias: [28, 34, 46, 52] },
  { id: "p-28-34-46-52-58", label: "28 + 34 + 46 + 52 + 58", dias: [28, 34, 46, 52, 58] },
  { id: "p-30", label: "30", dias: [30] },
  { id: "p-30-45", label: "30 + 45", dias: [30, 45] },
  { id: "p-30-45-60", label: "30 + 45 + 60", dias: [30, 45, 60] },
  { id: "p-30-45-60-75", label: "30 + 45 + 60 + 75", dias: [30, 45, 60, 75] },
  { id: "p-30-45-60-75-90", label: "30 + 45 + 60 + 75 + 90", dias: [30, 45, 60, 75, 90] },
  { id: "p-30-60-90", label: "30 + 60 + 90", dias: [30, 60, 90] },
  { id: "p-ato-30-60-90", label: "Ato + 30 + 60 + 90", dias: [0, 30, 60, 90] },
  { id: "p-28-56-84", label: "28 + 56 + 84", dias: [28, 56, 84] },
];

describe("catálogo de prazos", () => {
  it("tem exatamente 37 prazos com ids únicos", () => {
    expect(PRAZOS_CATALOGO).toHaveLength(37);
    expect(new Set(PRAZOS_CATALOGO.map((p) => p.id)).size).toBe(37);
  });

  it("todos os percentuais somam exatamente 100", () => {
    for (const prazo of PRAZOS_CATALOGO) {
      const pcts = percentuaisIguais(prazo.dias.length);
      expect(somaPercentuais(pcts.map((percentual) => ({ percentual })))).toBe(100);
    }
  });

  it("nenhum prazo passa de 90 dias", () => {
    for (const prazo of PRAZOS_CATALOGO) {
      expect(Math.max(...prazo.dias)).toBeLessThanOrEqual(90);
    }
  });

  it("os dias de cada prazo são crescentes", () => {
    for (const prazo of PRAZOS_CATALOGO) {
      const ordenado = [...prazo.dias].sort((a, b) => a - b);
      expect(prazo.dias).toEqual(ordenado);
    }
  });
});
