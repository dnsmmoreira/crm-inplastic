import { describe, expect, it } from "vitest";
import {
  ATRASO_MAX_MS,
  ATRASO_MIN_MS,
  TYPING_MAX_MS,
  calcularAtrasoMs,
  calcularEsperaAntesDoTyping,
  calcularTypingMs,
} from "./zapi-humanizacao";
import {
  calcularPausadoAte,
  deveAbrirPorFalhas,
  falhasNaJanela,
  pausaAtiva,
} from "./zapi-disjuntor";

describe("E1 — atraso humano", () => {
  it("respeita o piso de 20s", () => {
    expect(calcularAtrasoMs(0)).toBe(ATRASO_MIN_MS);
  });

  it("respeita o teto de 90s", () => {
    expect(calcularAtrasoMs(1)).toBeLessThanOrEqual(ATRASO_MAX_MS);
    expect(calcularAtrasoMs(0.999999)).toBeLessThanOrEqual(ATRASO_MAX_MS);
  });

  it("fica sempre entre 20s e 90s para valores aleatórios", () => {
    for (let i = 0; i < 500; i++) {
      const ms = calcularAtrasoMs();
      expect(ms).toBeGreaterThanOrEqual(ATRASO_MIN_MS);
      expect(ms).toBeLessThanOrEqual(ATRASO_MAX_MS);
    }
  });

  it("digitação é proporcional ao texto com teto de 15s", () => {
    expect(calcularTypingMs("oi")).toBeLessThan(calcularTypingMs("oi".repeat(50)));
    expect(calcularTypingMs("x".repeat(5000))).toBe(TYPING_MAX_MS);
  });

  it("desconta o typing do atraso (nunca soma)", () => {
    expect(calcularEsperaAntesDoTyping(60_000, 10_000)).toBe(50_000);
    expect(calcularEsperaAntesDoTyping(5_000, 15_000)).toBe(0);
  });
});

describe("E4 — disjuntor", () => {
  it("abre com 5 falhas em 10 minutos", () => {
    const agora = Date.now();
    const ts = [0, 1, 2, 3, 4].map((i) => agora - i * 60_000);
    expect(falhasNaJanela(ts, agora)).toBe(5);
    expect(deveAbrirPorFalhas(falhasNaJanela(ts, agora))).toBe(true);
  });

  it("não abre com 4 falhas na janela nem com falhas antigas", () => {
    const agora = Date.now();
    expect(deveAbrirPorFalhas(4)).toBe(false);
    const antigas = [agora - 11 * 60_000, agora - 20 * 60_000, agora - 60 * 60_000];
    expect(falhasNaJanela(antigas, agora)).toBe(0);
  });

  it("fecha após 30 minutos", () => {
    const agora = Date.now();
    const ate = calcularPausadoAte(agora);
    expect(pausaAtiva(ate, agora)).toBe(true);
    expect(pausaAtiva(ate, agora + 29 * 60_000)).toBe(true);
    expect(pausaAtiva(ate, agora + 30 * 60_000 + 1)).toBe(false);
    expect(pausaAtiva(null, agora)).toBe(false);
  });
});
