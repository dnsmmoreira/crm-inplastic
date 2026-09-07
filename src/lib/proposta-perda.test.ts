import { describe, expect, it } from "vitest";
import { dataRecontato, leadDeveIrParaPerdido } from "./proposta-perda";

describe("leadDeveIrParaPerdido", () => {
  it("sem outras propostas → lead vai para perdido", () => {
    expect(leadDeveIrParaPerdido([])).toBe(true);
  });

  it("resta proposta viva → lead fica onde está", () => {
    expect(leadDeveIrParaPerdido(["enviada"])).toBe(false);
    expect(leadDeveIrParaPerdido(["rascunho"])).toBe(false);
    expect(leadDeveIrParaPerdido(["recusada", "aguardando_aprovacao"])).toBe(false);
  });

  it("só propostas encerradas → lead vai para perdido", () => {
    expect(leadDeveIrParaPerdido(["recusada", "recusada"])).toBe(true);
    expect(leadDeveIrParaPerdido(["pedido"])).toBe(true);
  });
});

describe("dataRecontato", () => {
  const hoje = new Date("2026-01-01T12:00:00.000Z");

  it("90 dias no caso padrão", () => {
    expect(dataRecontato("Preço", hoje)).toBe("2026-04-01");
  });

  it("180 dias em demanda adiada", () => {
    expect(dataRecontato("Demanda cancelada ou adiada", hoje)).toBe("2026-06-30");
  });

  it("null quando o motivo não pede recontato", () => {
    expect(dataRecontato("Duplicidade", hoje)).toBeNull();
    expect(dataRecontato("Lead inválido", hoje)).toBeNull();
  });
});
