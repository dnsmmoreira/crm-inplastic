import { describe, it, expect } from "vitest";
import { podeAssumirPedido, PEDIDO_STAGES_ASSUMIVEIS } from "@/lib/pedidos-stages";

describe("podeAssumirPedido", () => {
  it("permite assumir nas etapas operacionais", () => {
    expect(podeAssumirPedido("programacao")).toBe(true);
    expect(podeAssumirPedido("em_producao")).toBe(true);
    expect(podeAssumirPedido("pronto")).toBe(true);
  });

  it("recusa antes da liberação e depois do faturamento", () => {
    expect(podeAssumirPedido("analise_financeira")).toBe(false);
    expect(podeAssumirPedido("aguardando_pagamento")).toBe(false);
    expect(podeAssumirPedido("faturado_em_rota")).toBe(false);
    expect(podeAssumirPedido("pos_venda")).toBe(false);
    expect(podeAssumirPedido("reprovado_financeiro")).toBe(false);
    expect(podeAssumirPedido("cancelado")).toBe(false);
  });

  it("recusa etapa desconhecida (fail-closed)", () => {
    expect(podeAssumirPedido("")).toBe(false);
    expect(podeAssumirPedido("etapa_inexistente")).toBe(false);
  });

  it("mantém a lista de etapas assumíveis estável", () => {
    expect([...PEDIDO_STAGES_ASSUMIVEIS]).toEqual(["programacao", "em_producao", "pronto"]);
  });
});
