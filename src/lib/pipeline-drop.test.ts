import { describe, expect, it } from "vitest";
import { identificarCard, resolverColunaAlvo } from "./pipeline-drop";

const COLUNAS = ["atendimento", "novo", "proposta", "ganho", "perdido"] as const;

describe("resolverColunaAlvo", () => {
  it("aceita apenas colunas do quadro", () => {
    expect(resolverColunaAlvo("perdido", COLUNAS)).toBe("perdido");
    expect(resolverColunaAlvo("ganho", COLUNAS)).toBe("ganho");
  });

  it("ignora ids que não são colunas (cards, ids nulos)", () => {
    expect(resolverColunaAlvo("prop:123", COLUNAS)).toBeNull();
    expect(resolverColunaAlvo("negociacao", COLUNAS)).toBeNull();
    expect(resolverColunaAlvo(null, COLUNAS)).toBeNull();
    expect(resolverColunaAlvo(undefined, COLUNAS)).toBeNull();
  });
});

describe("identificarCard", () => {
  it("distingue proposta de lead", () => {
    expect(identificarCard("prop:abc")).toEqual({ tipo: "proposta", id: "abc" });
    expect(identificarCard("lead-1")).toEqual({ tipo: "lead", id: "lead-1" });
  });
});
