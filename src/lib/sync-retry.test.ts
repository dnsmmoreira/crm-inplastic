import { describe, it, expect } from "vitest";
import { ControleRetry, MAX_TENTATIVAS, esperaDaTentativa } from "./sync-retry";

describe("esperaDaTentativa", () => {
  it("cresce a cada tentativa e estabiliza no teto", () => {
    expect(esperaDaTentativa(1)).toBe(2_000);
    expect(esperaDaTentativa(2)).toBe(8_000);
    expect(esperaDaTentativa(3)).toBe(20_000);
    expect(esperaDaTentativa(9)).toBe(20_000);
  });
});

describe("ControleRetry", () => {
  it("repete até o limite e então desiste", () => {
    const c = new ControleRetry();
    const d1 = c.registrarFalha("tasks");
    expect(d1).toMatchObject({ tentativa: 1, repetir: true, desistiu: false });
    expect(d1.esperaMs).toBe(2_000);

    const d2 = c.registrarFalha("tasks");
    expect(d2).toMatchObject({ tentativa: 2, repetir: true, desistiu: false });

    const d3 = c.registrarFalha("tasks");
    expect(d3).toMatchObject({ tentativa: MAX_TENTATIVAS, repetir: false, desistiu: true });
    expect(d3.esperaMs).toBe(0);
  });

  it("depois de desistir recomeça a contagem do zero", () => {
    const c = new ControleRetry();
    c.registrarFalha("tasks");
    c.registrarFalha("tasks");
    c.registrarFalha("tasks");
    expect(c.tentativas("tasks")).toBe(0);
    expect(c.registrarFalha("tasks").tentativa).toBe(1);
  });

  it("sucesso zera a contagem", () => {
    const c = new ControleRetry();
    c.registrarFalha("tasks");
    c.limpar("tasks");
    expect(c.tentativas("tasks")).toBe(0);
  });

  it("uma coleção não interfere na outra", () => {
    const c = new ControleRetry();
    c.registrarFalha("tasks");
    c.registrarFalha("tasks");
    expect(c.registrarFalha("leads")).toMatchObject({ tentativa: 1, repetir: true });
    expect(c.tentativas("tasks")).toBe(2);
  });
});
