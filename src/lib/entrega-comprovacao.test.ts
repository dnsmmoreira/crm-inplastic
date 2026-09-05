import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_COMPROVACAO,
  comprovacaoCompleta,
  dataEntregaValida,
  precisaComprovacao,
  recebidoPorValido,
} from "./entrega-comprovacao";

describe("comprovacaoCompleta", () => {
  it("sem anexos, falta tudo", () => {
    const r = comprovacaoCompleta([]);
    expect(r.ok).toBe(false);
    expect(r.faltando).toHaveLength(2);
  });

  it("só foto não basta", () => {
    const r = comprovacaoCompleta([{ categoria: "foto_entrega" }]);
    expect(r.ok).toBe(false);
    expect(r.faltando).toEqual(["Canhoto da NF assinado ou Comprovante / recibo"]);
  });

  it("só canhoto não basta", () => {
    const r = comprovacaoCompleta([{ categoria: "canhoto_nf" }]);
    expect(r.ok).toBe(false);
    expect(r.faltando).toEqual(["Foto da entrega"]);
  });

  it("foto + canhoto completa", () => {
    expect(
      comprovacaoCompleta([{ categoria: "foto_entrega" }, { categoria: "canhoto_nf" }]).ok,
    ).toBe(true);
  });

  it("foto + comprovante completa", () => {
    expect(
      comprovacaoCompleta([
        { categoria: "foto_entrega" },
        { categoria: "comprovante_entrega" },
      ]).ok,
    ).toBe(true);
  });

  it("documento removido não conta", () => {
    const r = comprovacaoCompleta([
      { categoria: "foto_entrega" },
      { categoria: "canhoto_nf", removido_em: "2026-09-01T00:00:00Z" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("categorias de cadastro não comprovam entrega", () => {
    expect(comprovacaoCompleta([{ categoria: "contrato_social" }]).ok).toBe(false);
  });

  it("as três categorias estão declaradas", () => {
    expect(CATEGORIAS_COMPROVACAO).toEqual([
      "foto_entrega",
      "canhoto_nf",
      "comprovante_entrega",
    ]);
  });
});

describe("precisaComprovacao", () => {
  it("pós-venda sem comprovação precisa", () => {
    expect(precisaComprovacao({ stage: "pos_venda", entrega_comprovada_em: null })).toBe(true);
  });
  it("pós-venda já comprovado não precisa", () => {
    expect(
      precisaComprovacao({ stage: "pos_venda", entrega_comprovada_em: "2026-09-04T10:00:00Z" }),
    ).toBe(false);
  });
  it("outras etapas não precisam", () => {
    expect(precisaComprovacao({ stage: "em_producao", entrega_comprovada_em: null })).toBe(false);
  });
  it("nulo não quebra", () => {
    expect(precisaComprovacao(null)).toBe(false);
  });
});

describe("campos obrigatórios", () => {
  it("recebido por exige 3 caracteres", () => {
    expect(recebidoPorValido("  ")).toBe(false);
    expect(recebidoPorValido("Jo")).toBe(false);
    expect(recebidoPorValido(" Ana ")).toBe(true);
  });

  it("data de entrega não pode ser futura nem vazia", () => {
    const agora = new Date("2026-09-05T12:00:00Z");
    expect(dataEntregaValida(null, agora)).toBe(false);
    expect(dataEntregaValida("xx", agora)).toBe(false);
    expect(dataEntregaValida("2026-09-05T11:00:00Z", agora)).toBe(true);
    expect(dataEntregaValida("2026-09-06T11:00:00Z", agora)).toBe(false);
  });
});
