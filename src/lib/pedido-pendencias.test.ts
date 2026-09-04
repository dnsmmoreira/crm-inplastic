import { describe, expect, it } from "vitest";
import {
  aprovacaoClienteValida,
  calcularPendenciasPedido,
  ehRetirada,
  rotuloMeioAprovacao,
  type PendenciaInput,
} from "./pedido-pendencias";

const ok: PendenciaInput = {
  cliente: {
    clienteId: "c1",
    nome: "ACME Embalagens LTDA",
    tipoPessoa: "PJ",
    cnpj: "11.222.333/0001-81",
    emailNf: "fiscal@acme.com.br",
  },
  paymentTermId: "t1",
  transporte: { freightPayer: "CIF", carrier: "Braspress", deliveryCep: "01310-100" },
  expectedDeliveryDate: "2026-09-20",
  tratativa: "Cliente aceitou 30/60 dias com frete CIF.",
  itens: [
    { id: "i1", description: "Caixa 30L", quantity: 10, unitPrice: 25, productId: "p1", pesoKg: 1.2 },
  ],
};

const codigos = (i: PendenciaInput) => calcularPendenciasPedido(i).map((p) => p.codigo);

describe("calcularPendenciasPedido", () => {
  it("tudo ok → nenhuma pendência", () => {
    expect(calcularPendenciasPedido(ok)).toEqual([]);
  });

  it("cliente sem documento válido ou sem nome", () => {
    expect(codigos({ ...ok, cliente: { ...ok.cliente, cnpj: "11.111.111/1111-11" } })).toContain(
      "cliente_sem_documento",
    );
    expect(codigos({ ...ok, cliente: { ...ok.cliente, nome: "  " } })).toContain(
      "cliente_sem_documento",
    );
    // CPF válido também serve
    expect(
      codigos({
        ...ok,
        cliente: { ...ok.cliente, cnpj: null, cpf: "529.982.247-25", tipoPessoa: "PF" },
      }),
    ).not.toContain("cliente_sem_documento");
  });

  it("link aponta para o cliente ou para o lead", () => {
    const [p1] = calcularPendenciasPedido({ ...ok, cliente: { ...ok.cliente, nome: "" } });
    expect(p1.link).toBe("/clientes?editar=c1");
    const semCliente = calcularPendenciasPedido({
      ...ok,
      cliente: { leadId: "l9", nome: "", cnpj: null },
    });
    expect(semCliente[0].link).toBe("/leads?lead=l9");
  });

  it("e-mail de NF vazio ou inválido bloqueia", () => {
    expect(codigos({ ...ok, cliente: { ...ok.cliente, emailNf: "" } })).toContain(
      "cliente_sem_email_nf",
    );
    expect(codigos({ ...ok, cliente: { ...ok.cliente, emailNf: "fiscal@acme" } })).toContain(
      "cliente_sem_email_nf",
    );
  });

  it("condição de pagamento obrigatória", () => {
    expect(codigos({ ...ok, paymentTermId: null })).toContain("sem_condicao_pagamento");
  });

  it("entrega: aceita endereço, CEP ou retirada", () => {
    expect(codigos({ ...ok, transporte: { freightPayer: "FOB", carrier: "" } })).toContain(
      "sem_entrega",
    );
    expect(
      codigos({ ...ok, transporte: { freightPayer: "FOB", deliveryAddress: "Rua X, 100" } }),
    ).not.toContain("sem_entrega");
    expect(
      codigos({ ...ok, transporte: { freightPayer: "FOB", carrier: "Cliente retira" } }),
    ).not.toContain("sem_entrega");
    expect(ehRetirada({ carrier: "Veículo próprio" })).toBe(true);
    expect(ehRetirada({ carrier: "Braspress" })).toBe(false);
  });

  it("previsão de entrega obrigatória", () => {
    expect(codigos({ ...ok, expectedDeliveryDate: null })).toContain("sem_previsao_entrega");
  });

  it("tratativa curta bloqueia", () => {
    expect(codigos({ ...ok, tratativa: "ok" })).toContain("sem_tratativa");
  });

  it("item sem produto do catálogo", () => {
    const p = calcularPendenciasPedido({
      ...ok,
      itens: [{ id: "i1", description: "Caixa avulsa", quantity: 1, unitPrice: 5 }],
    });
    expect(p.map((x) => x.codigo)).toContain("item_sem_catalogo");
    expect(p[0].mensagem).toContain("Caixa avulsa");
  });

  it("produto sem peso cadastrado", () => {
    const p = calcularPendenciasPedido({
      ...ok,
      itens: [{ id: "i1", description: "Caixa", quantity: 1, unitPrice: 5, productId: "p1", pesoKg: 0 }],
    });
    expect(p.map((x) => x.codigo)).toContain("item_sem_peso");
    expect(p[0].link).toBe("/produtos?editar=p1");
  });

  it("quantidade ou preço zerado", () => {
    expect(
      codigos({
        ...ok,
        itens: [{ id: "i1", description: "Caixa", quantity: 0, unitPrice: 5, productId: "p1", pesoKg: 1 }],
      }),
    ).toContain("item_invalido");
    expect(
      codigos({
        ...ok,
        itens: [{ id: "i1", description: "Caixa", quantity: 2, unitPrice: 0, productId: "p1", pesoKg: 1 }],
      }),
    ).toContain("item_invalido");
  });
});

describe("aprovação do cliente", () => {
  it("exige meio válido e detalhe com 10+ caracteres", () => {
    expect(aprovacaoClienteValida({ meio: "email", detalhe: "curto" })).toBe(false);
    expect(aprovacaoClienteValida({ meio: "carta", detalhe: "detalhe suficiente" })).toBe(false);
    expect(aprovacaoClienteValida({ meio: "whatsapp", detalhe: "Comprador aprovou 50 un." })).toBe(
      true,
    );
    expect(aprovacaoClienteValida(null)).toBe(false);
  });

  it("rótulo legível do meio", () => {
    expect(rotuloMeioAprovacao("pedido_compra")).toBe("Pedido de compra / OC");
    expect(rotuloMeioAprovacao(null)).toBe("");
  });
});
