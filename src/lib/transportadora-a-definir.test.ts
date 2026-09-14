import { describe, expect, it } from "vitest";

import { derivarEntregaDaProposta } from "@/lib/pedido-entrega";
import { calcularPendenciasPedido, ehRetirada } from "@/lib/pedido-pendencias";
import { entregaDefinida } from "@/lib/pedido-avanco";
import {
  ehOpcaoEspecialTransporte,
  ehTransportadoraADefinir,
  OPCOES_ESPECIAIS_TRANSPORTE,
  TRANSPORTADORA_A_DEFINIR_CLIENTE,
} from "@/lib/transportadoras";

const A_DEFINIR = TRANSPORTADORA_A_DEFINIR_CLIENTE;

function entradaPendencia(carrier: string | null) {
  return {
    cliente: {
      clienteId: "c1",
      nome: "Cliente Teste",
      cnpj: "11.222.333/0001-81",
      emailNf: "nf@cliente.com",
      uf: "SP",
    },
    transporte: { carrier, deliveryAddress: "Rua A, 100", deliveryCep: "01000-000" },
    paymentTermId: "pt1",
    expectedDeliveryDate: "2026-10-01",
    tratativa: "Negociação fechada com o comprador em 14/09, prazo acordado.",
    itens: [{ description: "Produto", quantity: 1, unitPrice: 10 }],
  } as any;
}

describe("Transportador: A Definir Pelo Cliente", () => {
  it("é opção especial, mas NÃO é retirada", () => {
    expect(OPCOES_ESPECIAIS_TRANSPORTE).toContain(A_DEFINIR);
    expect(ehOpcaoEspecialTransporte(A_DEFINIR)).toBe(true);
    expect(ehTransportadoraADefinir(A_DEFINIR)).toBe(true);
    expect(ehTransportadoraADefinir("Cliente retira")).toBe(false);
    expect(ehRetirada({ carrier: A_DEFINIR })).toBe(false);
  });

  it("gera pedido como coleta com o texto gravado", () => {
    expect(derivarEntregaDaProposta({ carrier: A_DEFINIR })).toEqual({
      modalidade_entrega: "coleta",
      transportadora: A_DEFINIR,
      transportadoraId: null,
    });
  });

  it("conta como decisão definida (não cai em sem_transportadora)", () => {
    const comDecisao = calcularPendenciasPedido(entradaPendencia(A_DEFINIR));
    expect(comDecisao.map((p) => p.codigo)).not.toContain("sem_transportadora");

    const semDecisao = calcularPendenciasPedido(entradaPendencia(null));
    expect(semDecisao.map((p) => p.codigo)).toContain("sem_transportadora");
  });

  it("passa pelo guard de legado do pedido", () => {
    expect(entregaDefinida({ modalidade_entrega: "coleta", transportadora: A_DEFINIR })).toBe(true);
    expect(entregaDefinida({ modalidade_entrega: "coleta", transportadora: null })).toBe(false);
  });
});
