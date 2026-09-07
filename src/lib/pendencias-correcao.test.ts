import { describe, expect, it } from "vitest";
import {
  documentoValido,
  documentoValidoCompleto,
  emailValido,
  mascararDocumento,
  normalizarPeso,
  pesoValido,
  soDigitos,
} from "./pendencias-correcao";
import {
  comprovacaoDispensada,
  motivoDispensaValido,
  precisaComprovacao,
} from "./entrega-comprovacao";

describe("peso", () => {
  it("aceita número positivo em vírgula ou ponto", () => {
    expect(pesoValido("1,5")).toBe(true);
    expect(normalizarPeso("1,5")).toBe(1.5);
    expect(normalizarPeso(2)).toBe(2);
  });
  it("recusa zero, negativo e texto", () => {
    expect(pesoValido("0")).toBe(false);
    expect(pesoValido("-1")).toBe(false);
    expect(pesoValido("abc")).toBe(false);
    expect(normalizarPeso("abc")).toBeNull();
  });
});

describe("e-mail", () => {
  it("valida formato simples", () => {
    expect(emailValido("nf@empresa.com.br")).toBe(true);
    expect(emailValido("sem-arroba")).toBe(false);
    expect(emailValido("")).toBe(false);
  });
});

describe("documento", () => {
  it("reconhece CPF e CNPJ pelo tamanho", () => {
    expect(documentoValido("11.222.333/0001-81")).toBe("cnpj");
    expect(documentoValido("529.982.247-25")).toBe("cpf");
    expect(documentoValido("123")).toBeNull();
  });
  it("confere dígitos verificadores antes de gravar", () => {
    expect(documentoValidoCompleto("11.222.333/0001-81")).toBe("cnpj");
    expect(documentoValidoCompleto("11.111.111/1111-11")).toBeNull();
    expect(documentoValidoCompleto("529.982.247-25")).toBe("cpf");
    expect(documentoValidoCompleto("111.111.111-11")).toBeNull();
    // o tamanho sozinho continua aceitando (feedback enquanto digita)
    expect(documentoValido("11.111.111/1111-11")).toBe("cnpj");
  });
  it("mascara conforme digita", () => {
    expect(soDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(mascararDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararDocumento("52998224725")).toBe("529.982.247-25");
  });
});

describe("dispensa da comprovação", () => {
  it("exige motivo com pelo menos 5 caracteres", () => {
    expect(motivoDispensaValido("ok")).toBe(false);
    expect(motivoDispensaValido("pedido legado")).toBe(true);
  });
  it("pedido dispensado deixa de cobrar comprovação", () => {
    const base = { stage: "pos_venda", entrega_comprovada_em: null };
    expect(precisaComprovacao(base)).toBe(true);
    const dispensado = { ...base, comprovacao_dispensada_em: "2026-09-01T00:00:00Z" };
    expect(comprovacaoDispensada(dispensado)).toBe(true);
    expect(precisaComprovacao(dispensado)).toBe(false);
  });
});
