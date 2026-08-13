import { describe, expect, it } from "vitest";
import {
  NOME_FALLBACK,
  montarComponenteBody,
  primeiroNome,
  sanitizarParametro,
} from "./whatsapp-template";

describe("primeiroNome", () => {
  it("extrai e capitaliza o primeiro nome", () => {
    expect(primeiroNome("maria da silva")).toBe("Maria");
    expect(primeiroNome("  JOÃO Pedro ")).toBe("João");
  });

  it("usa fallback para valores inválidos", () => {
    expect(primeiroNome("")).toBe(NOME_FALLBACK);
    expect(primeiroNome(null)).toBe(NOME_FALLBACK);
    expect(primeiroNome("5511999998888")).toBe(NOME_FALLBACK);
    expect(primeiroNome("J")).toBe(NOME_FALLBACK);
  });
});

describe("sanitizarParametro", () => {
  it("remove quebras de linha, tabs e espaços duplicados", () => {
    expect(sanitizarParametro("linha1\nlinha2\t  x")).toBe("linha1 linha2 x");
  });
});

describe("montarComponenteBody", () => {
  it("monta um componente body com os parâmetros", () => {
    expect(montarComponenteBody(["Maria"])).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Maria" }] },
    ]);
  });

  it("retorna vazio quando não há parâmetro utilizável", () => {
    expect(montarComponenteBody([])).toEqual([]);
    expect(montarComponenteBody(["", null, undefined])).toEqual([]);
  });
});
