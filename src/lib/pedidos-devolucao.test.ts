/**
 * Recusa/devolução de pedido: caminho único em qualquer etapa não terminal.
 */
import { describe, it, expect } from "vitest";
import { podeDevolverPedido, destinoDevolucao } from "@/lib/pedidos-stages";
import { textoAvisoDevolucao } from "@/lib/pedidos-devolucao.server";

describe("elegibilidade da devolução", () => {
  it("permite devolver em qualquer etapa não terminal", () => {
    for (const s of [
      "analise_financeira",
      "aguardando_pagamento",
      "programacao",
      "em_producao",
      "pronto",
      "faturado_em_rota",
      "pos_venda",
    ]) {
      expect(podeDevolverPedido(s)).toBe(true);
    }
  });

  it("não permite devolver pedido já encerrado", () => {
    for (const s of ["cancelado", "reprovado_financeiro", "concluido"]) {
      expect(podeDevolverPedido(s)).toBe(false);
    }
  });
});

describe("destino da devolução", () => {
  it("mantém reprovado financeiro nas etapas financeiras (métrica do painel)", () => {
    expect(destinoDevolucao("analise_financeira")).toBe("reprovado_financeiro");
    expect(destinoDevolucao("aguardando_pagamento")).toBe("reprovado_financeiro");
  });

  it("usa cancelado nas demais etapas", () => {
    expect(destinoDevolucao("em_producao")).toBe("cancelado");
    expect(destinoDevolucao("pronto")).toBe("cancelado");
    expect(destinoDevolucao("pos_venda")).toBe("cancelado");
  });
});

describe("texto do aviso ao vendedor", () => {
  it("cita pedido, motivo e proposta reaberta", () => {
    const t = textoAvisoDevolucao({
      pedidoNumero: "PED-2026-0021",
      motivo: "quantidade errada",
      propostaNumero: "2026-0166",
    });
    expect(t).toContain("PED-2026-0021");
    expect(t).toContain("quantidade errada");
    expect(t).toContain("2026-0166");
    expect(t).toContain("editável");
  });

  it("funciona mesmo sem proposta vinculada", () => {
    const t = textoAvisoDevolucao({
      pedidoNumero: "PED-2026-0080",
      motivo: "endereço incorreto",
      propostaNumero: null,
    });
    expect(t).toContain("PED-2026-0080");
    expect(t).not.toContain("undefined");
  });
});
