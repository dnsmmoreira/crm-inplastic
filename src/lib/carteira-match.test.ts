import { describe, expect, it } from "vitest";
import {
  chaveCnpj,
  chaveEmail,
  chaveTelefone,
  chavesDoContato,
  mesmoTelefone,
  temChave,
} from "./carteira-match";

describe("chave de telefone da carteira", () => {
  const equivalentes = ["34997793330", "(34) 99779-3330", "5534997793330", "3497793330"];

  it("todas as formas do mesmo número viram a mesma chave", () => {
    const chaves = equivalentes.map(chaveTelefone);
    expect(new Set(chaves).size).toBe(1);
    expect(chaves[0]).toBe("3497793330");
  });

  it("compara qualquer par das formas equivalentes", () => {
    for (const a of equivalentes) {
      for (const b of equivalentes) expect(mesmoTelefone(a, b)).toBe(true);
    }
  });

  it("números diferentes não casam", () => {
    expect(mesmoTelefone("34997793330", "34997793331")).toBe(false);
    expect(mesmoTelefone("34997793330", "11997793330")).toBe(false);
  });

  it("sem DDD não vira chave", () => {
    expect(chaveTelefone("97793330")).toBeNull();
    expect(chaveTelefone("997793330")).toBeNull();
    expect(chaveTelefone("")).toBeNull();
    expect(chaveTelefone(null)).toBeNull();
    expect(mesmoTelefone(null, null)).toBe(false);
  });
});

describe("chaves de CNPJ e e-mail", () => {
  it("CNPJ só com 14 dígitos", () => {
    expect(chaveCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(chaveCnpj("1234567800019")).toBeNull();
  });

  it("e-mail em minúsculas e sem espaços", () => {
    expect(chaveEmail("  Contato@Empresa.COM ")).toBe("contato@empresa.com");
    expect(chaveEmail("sem-arroba")).toBeNull();
  });

  it("agrupa as chaves do contato", () => {
    const c = chavesDoContato({ telefone: "5534997793330", cnpj: "abc", email: "A@B.com" });
    expect(c).toEqual({ telefone: "3497793330", cnpj: null, email: "a@b.com" });
    expect(temChave(c)).toBe(true);
    expect(temChave({ telefone: null, cnpj: null, email: null })).toBe(false);
  });
});
