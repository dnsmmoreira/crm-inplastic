import { describe, it, expect } from "vitest";
import {
  decidirEntrada,
  temChaveForte,
  normalizarNomeEmpresa,
  possivelDuplicidadePorNome,
} from "@/lib/contato-entrada";
import { chaveTelefone } from "@/lib/carteira-match";

describe("porta de entrada única", () => {
  it("caso Mauricio: 5519996733919 e 19996733919 são o mesmo contato", () => {
    expect(chaveTelefone("5519996733919")).toBe(chaveTelefone("19996733919"));
  });

  it("cliente da carteira tem precedência sobre lead ativo", () => {
    const d = decidirEntrada({
      carteira: { clienteId: "c1", leadId: "l1", vendedorId: "v1", origem: "cliente:1" },
      leadAtivo: { leadId: "l2", ownerId: "v2", stage: "novo", company: "X", origem: "lead_ativo:telefone" },
    });
    expect(d).toMatchObject({ acao: "carteira", vendedorId: "v1" });
  });

  it("lead ativo casado reaproveita o lead e o dono dele", () => {
    const d = decidirEntrada({
      carteira: null,
      leadAtivo: {
        leadId: "97df561a",
        ownerId: "v2",
        stage: "novo",
        company: "VIA ESTETICA",
        origem: "lead_ativo:cnpj",
      },
    });
    expect(d).toEqual({ acao: "lead_existente", leadId: "97df561a", vendedorId: "v2", origem: "lead_ativo:cnpj" });
  });

  it("conversa já vinculada não troca de lead", () => {
    const d = decidirEntrada({
      conversaLeadId: "1205330c",
      carteira: { clienteId: null, leadId: "outro", vendedorId: "v9", origem: "cliente:9" },
      leadAtivo: null,
    });
    expect(d).toMatchObject({ acao: "lead_existente", leadId: "1205330c" });
  });

  it("sem casamento, cria lead novo (rodízio segue valendo)", () => {
    expect(decidirEntrada({ carteira: null, leadAtivo: null })).toEqual({ acao: "criar_lead" });
  });

  it("chave forte exige telefone válido ou CNPJ completo", () => {
    expect(temChaveForte({ telefone: "19996733919" })).toBe(true);
    expect(temChaveForte({ cnpj: "12.345.678/0001-95" })).toBe(true);
    expect(temChaveForte({ cnpj: "123" })).toBe(false);
    expect(temChaveForte({})).toBe(false);
  });

  it("nome só levanta suspeita, com ruído societário removido", () => {
    expect(normalizarNomeEmpresa("Via Estética Comércio LTDA")).toBe("via estetica");
    expect(possivelDuplicidadePorNome("VIA ESTETICA COMERCIO LTDA", "Via Estética")).toBe(true);
    expect(possivelDuplicidadePorNome("Mauricio", "Marcio")).toBe(false);
  });
});
