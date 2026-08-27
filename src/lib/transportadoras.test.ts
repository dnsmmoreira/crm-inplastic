import { describe, expect, it } from "vitest";
import {
  ehOpcaoEspecialTransporte,
  escolherSugestaoTransportadora,
  normalizarUf,
  OPCOES_ESPECIAIS_TRANSPORTE,
} from "./transportadoras";

describe("normalizarUf", () => {
  it("aceita sigla válida e ignora lixo", () => {
    expect(normalizarUf(" sp ")).toBe("SP");
    expect(normalizarUf("São Paulo")).toBeNull();
    expect(normalizarUf(undefined)).toBeNull();
  });
});

describe("opções especiais", () => {
  it("reconhece as duas fixas, sem depender de caixa", () => {
    expect(OPCOES_ESPECIAIS_TRANSPORTE).toHaveLength(2);
    expect(ehOpcaoEspecialTransporte("cliente retira")).toBe(true);
    expect(ehOpcaoEspecialTransporte("Veículo próprio")).toBe(true);
    expect(ehOpcaoEspecialTransporte("Transportadora X")).toBe(false);
  });
});

describe("escolherSugestaoTransportadora", () => {
  it("retorna null sem UF", () => {
    expect(escolherSugestaoTransportadora([{ transportadoraId: "a", uf: "SP" }], null)).toBeNull();
  });

  it("retorna null sem dado suficiente (histórico novo)", () => {
    expect(escolherSugestaoTransportadora([], "SP")).toBeNull();
    expect(escolherSugestaoTransportadora([{ transportadoraId: "a", uf: "SP" }], "SP")).toBeNull();
  });

  it("retorna a mais frequente do UF quando há base", () => {
    const usos = [
      { transportadoraId: "a", uf: "SP" },
      { transportadoraId: "a", uf: "SP" },
      { transportadoraId: "b", uf: "SP" },
    ];
    expect(escolherSugestaoTransportadora(usos, "sp")).toEqual({ transportadoraId: "a", usos: 2 });
  });

  it("ignora usos de outros UFs", () => {
    const usos = [
      { transportadoraId: "a", uf: "SP" },
      { transportadoraId: "a", uf: "BA" },
      { transportadoraId: "b", uf: "BA" },
      { transportadoraId: "b", uf: "BA" },
    ];
    expect(escolherSugestaoTransportadora(usos, "BA")).toEqual({ transportadoraId: "b", usos: 2 });
  });

  it("opções especiais e texto livre nunca entram na estatística", () => {
    const usos = [
      { transportadoraId: null, uf: "SP" },
      { transportadoraId: "", uf: "SP" },
      { transportadoraId: undefined, uf: "SP" },
      { transportadoraId: "a", uf: "SP" },
    ];
    expect(escolherSugestaoTransportadora(usos, "SP")).toBeNull();
  });
});
