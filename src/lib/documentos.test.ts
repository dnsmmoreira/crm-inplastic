import { describe, it, expect } from "vitest";
import {
  ehDocumentoVencido,
  calcularExpiracao,
  validarCategoria,
  categoriaLabel,
  caminhoStorage,
} from "./documentos";

describe("ehDocumentoVencido", () => {
  const envio = new Date("2026-01-10T12:00:00.000Z");
  const expira = calcularExpiracao(envio);

  it("não está vencido logo após o envio", () => {
    expect(ehDocumentoVencido(expira, envio)).toBe(false);
  });

  it("não está vencido 11 meses depois", () => {
    expect(ehDocumentoVencido(expira, new Date("2026-12-10T12:00:00.000Z"))).toBe(false);
  });

  it("no limite exato ainda não está vencido", () => {
    expect(ehDocumentoVencido(expira, expira)).toBe(false);
  });

  it("um segundo depois do limite está vencido", () => {
    expect(ehDocumentoVencido(expira, new Date(expira.getTime() + 1000))).toBe(true);
  });

  it("13 meses depois está vencido", () => {
    expect(ehDocumentoVencido(expira, new Date("2027-02-10T12:00:00.000Z"))).toBe(true);
  });

  it("sem data de expiração nunca vence", () => {
    expect(ehDocumentoVencido(null, new Date())).toBe(false);
    expect(ehDocumentoVencido("data-invalida", new Date())).toBe(false);
  });

  it("expiração é exatamente 12 meses após o envio", () => {
    expect(calcularExpiracao(envio).toISOString()).toBe("2027-01-10T12:00:00.000Z");
  });
});

describe("validarCategoria", () => {
  it("aceita categorias conhecidas", () => {
    expect(validarCategoria("balanco")).toBeNull();
    expect(validarCategoria("contrato_social")).toBeNull();
  });

  it("rejeita categoria desconhecida", () => {
    expect(validarCategoria("nota_fiscal")).toBe("Categoria inválida.");
  });

  it("exige rótulo livre quando a categoria é Outro", () => {
    expect(validarCategoria("outro")).toMatch(/Informe o nome/);
    expect(validarCategoria("outro", "   ")).toMatch(/Informe o nome/);
    expect(validarCategoria("outro", "Procuração")).toBeNull();
  });
});

describe("categoriaLabel", () => {
  it("usa o rótulo do catálogo", () => {
    expect(categoriaLabel("cartao_cnpj")).toBe("Cartão CNPJ");
  });
  it("usa o texto livre para Outro", () => {
    expect(categoriaLabel("outro", "Procuração")).toBe("Procuração");
    expect(categoriaLabel("outro", "")).toBe("Outro");
  });
});

describe("caminhoStorage", () => {
  it("normaliza o nome do arquivo", () => {
    expect(caminhoStorage("cliente", "abc", "Balanço 2025 (final).pdf", "u1")).toBe(
      "cliente/abc/u1-Balan_o_2025_final_.pdf",
    );
  });
});
