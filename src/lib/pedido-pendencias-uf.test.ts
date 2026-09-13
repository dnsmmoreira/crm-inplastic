/**
 * Regressão: pedido não pode nascer sem a UF do destinatário — sem ela o DIFAL
 * fica de fora e o total do pedido sai menor que o aprovado na proposta.
 */
import { describe, it, expect } from "vitest";
import { calcularPendenciasPedido, ufValida, type PendenciaInput } from "@/lib/pedido-pendencias";

function base(uf: string | null): PendenciaInput {
  return {
    cliente: {
      clienteId: "c1",
      leadId: "l1",
      nome: "Associação Criança Feliz",
      cnpj: "11.222.333/0001-81",
      emailNf: "nf@exemplo.com.br",
      uf,
    },
    paymentTermId: "pt1",
    transporte: { deliveryAddress: "Rua A, 100", carrier: "Transp X" },
    expectedDeliveryDate: "2026-10-01",
    tratativa: "Cliente aprovou por e-mail após negociação de prazo e frete.",
    itens: [{ id: "i1", description: "Caixa", quantity: 10, unitPrice: 100, productId: "p1", pesoKg: 2 }],
  };
}

const codigos = (i: PendenciaInput) => calcularPendenciasPedido(i).map((p) => p.codigo);

describe("pendência de UF", () => {
  it("aceita UF de duas letras e recusa o resto", () => {
    expect(ufValida("ES")).toBe(true);
    expect(ufValida("es")).toBe(true);
    expect(ufValida("")).toBe(false);
    expect(ufValida(null)).toBe(false);
    expect(ufValida("São Paulo")).toBe(false);
  });

  it("bloqueia a geração quando não há UF", () => {
    const pend = calcularPendenciasPedido(base(null));
    const uf = pend.find((p) => p.codigo === "cliente_sem_uf");
    expect(uf).toBeTruthy();
    expect(uf?.mensagem).toContain("DIFAL");
    expect(uf?.link).toBe("/clientes?editar=c1");
  });

  it("cadastro completo com UF não gera pendência alguma", () => {
    expect(codigos(base("ES"))).toEqual([]);
  });
});
