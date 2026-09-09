import { describe, expect, it } from "vitest";
import { decidirDevolucao, textoAvisoDevolucao } from "./lead-devolucao";

describe("aviso antes de devolver o lead", () => {
  it("sem aviso nenhum: avisa primeiro", () => {
    expect(decidirDevolucao(false, false)).toBe("avisar");
  });
  it("aviso com menos de 24h: espera", () => {
    expect(decidirDevolucao(true, true)).toBe("esperar");
  });
  it("aviso com 24h ou mais: devolve", () => {
    expect(decidirDevolucao(true, false)).toBe("devolver");
  });
  it("texto usa o nome da empresa", () => {
    expect(textoAvisoDevolucao("ACME")).toContain("ACME");
    expect(textoAvisoDevolucao(null)).toContain("sem nome");
  });
});
