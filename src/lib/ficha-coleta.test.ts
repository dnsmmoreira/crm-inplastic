import { describe, it, expect } from "vitest";
import {
  cubagemUnitariaProduto,
  derivarItemDoProduto,
  fichaEditavel,
  itensSemMedida,
  numeroFichaValido,
  pesoUnitarioProduto,
  podeTransicionarFicha,
  totaisFicha,
  validarEmissao,
} from "./ficha-coleta";

describe("medidas do produto", () => {
  it("peso zero conta como ausente (exige manual)", () => {
    expect(pesoUnitarioProduto({ weight_kg: 0 })).toBeNull();
    expect(pesoUnitarioProduto({ weight_kg: null })).toBeNull();
    expect(pesoUnitarioProduto({ weight_kg: 1.5 })).toBe(1.5);
  });

  it("cubagem exige as três dimensões positivas", () => {
    expect(cubagemUnitariaProduto({ height_cm: 10, width_cm: 10, length_cm: 0 })).toBeNull();
    expect(cubagemUnitariaProduto({ height_cm: 100, width_cm: 100, length_cm: 100 })).toBe(1);
  });

  it("deriva peso e cubagem totais pela quantidade", () => {
    const item = derivarItemDoProduto(
      { weight_kg: 2, height_cm: 50, width_cm: 50, length_cm: 50 },
      4,
    );
    expect(item.peso_kg).toBe(8);
    expect(item.cubagem_m3).toBe(0.5);
    expect(item.peso_manual).toBe(false);
  });

  it("produto sem dado devolve null, nunca zero silencioso", () => {
    const item = derivarItemDoProduto({ weight_kg: 0, height_cm: 0 }, 3);
    expect(item.peso_kg).toBeNull();
    expect(item.cubagem_m3).toBeNull();
  });
});

describe("totais e pendências", () => {
  it("soma ignorando nulos", () => {
    expect(totaisFicha([{ peso_kg: 1.5, cubagem_m3: 0.2 }, { peso_kg: null, cubagem_m3: 0.3 }]))
      .toEqual({ peso_kg: 1.5, cubagem_m3: 0.5 });
  });

  it("lista os itens sem medida", () => {
    const faltam = itensSemMedida([
      { peso_kg: 1, cubagem_m3: 1 },
      { peso_kg: 0, cubagem_m3: 1 },
      { peso_kg: 1, cubagem_m3: null },
    ]);
    expect(faltam).toHaveLength(2);
  });
});

describe("ciclo de vida", () => {
  it("só rascunho é editável", () => {
    expect(fichaEditavel("rascunho")).toBe(true);
    expect(fichaEditavel("emitida")).toBe(false);
  });

  it("transições permitidas", () => {
    expect(podeTransicionarFicha("rascunho", "emitida")).toBe(true);
    expect(podeTransicionarFicha("emitida", "rascunho")).toBe(false);
    expect(podeTransicionarFicha("coletada", "cancelada")).toBe(false);
    expect(podeTransicionarFicha("em_coleta", "coletada")).toBe(true);
  });
});

describe("validação de emissão", () => {
  const base = { contato_nome: "Bruna", contato_telefone: "(11) 2574-1360" };

  it("bloqueia sem itens", () => {
    expect(validarEmissao({ status: "rascunho", itens: [], ...base }).ok).toBe(false);
  });

  it("bloqueia item sem medida", () => {
    const r = validarEmissao({
      status: "rascunho",
      itens: [{ peso_kg: 1, cubagem_m3: null }],
      ...base,
    });
    expect(r.ok).toBe(false);
  });

  it("bloqueia sem contato", () => {
    const r = validarEmissao({
      status: "rascunho",
      itens: [{ peso_kg: 1, cubagem_m3: 1 }],
      contato_nome: " ",
      contato_telefone: "",
    });
    expect(r.ok).toBe(false);
  });

  it("aceita rascunho completo", () => {
    expect(
      validarEmissao({ status: "rascunho", itens: [{ peso_kg: 1, cubagem_m3: 1 }], ...base }).ok,
    ).toBe(true);
  });

  it("não emite o que já foi emitido", () => {
    expect(
      validarEmissao({ status: "emitida", itens: [{ peso_kg: 1, cubagem_m3: 1 }], ...base }).ok,
    ).toBe(false);
  });
});

describe("numeração", () => {
  it("valida o formato COL-AAAA-NNNNNN", () => {
    expect(numeroFichaValido("COL-2026-000001")).toBe(true);
    expect(numeroFichaValido("COL-2026-1")).toBe(false);
    expect(numeroFichaValido("PED-2026-000001")).toBe(false);
  });
});
