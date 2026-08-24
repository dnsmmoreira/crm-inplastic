import { describe, it, expect } from "vitest";
import { resumoHistoricoCliente, soDigitos, type PedidoHistoricoRow } from "./pedidos-historico";

const row = (p: Partial<PedidoHistoricoRow> & { id: string }): PedidoHistoricoRow => ({
  number: `PED-${p.id}`,
  created_at: "2026-01-01T00:00:00Z",
  total: 100,
  stage: "pos_venda",
  ocorrencias_abertas: 0,
  ...p,
});

describe("histórico do cliente", () => {
  it("exclui o pedido atual da contagem e da soma", () => {
    const h = resumoHistoricoCliente(
      [row({ id: "atual", total: 999 }), row({ id: "a", total: 50 }), row({ id: "b", total: 70 })],
      "atual",
    );
    expect(h.quantidade).toBe(2);
    expect(h.valor_total).toBe(120);
    expect(h.primeira_compra).toBe(false);
  });

  it("marca primeira compra quando só existe o pedido atual", () => {
    const h = resumoHistoricoCliente([row({ id: "atual" })], "atual");
    expect(h.quantidade).toBe(0);
    expect(h.primeira_compra).toBe(true);
    expect(h.ultimo_em).toBeNull();
  });

  it("último em = pedido anterior mais recente e limita a 5 recentes", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ id: `p${i}`, created_at: `2026-0${i + 1}-01T00:00:00Z` }),
    );
    const h = resumoHistoricoCliente([...rows, row({ id: "atual" })], "atual");
    expect(h.recentes).toHaveLength(5);
    expect(h.ultimo_em).toBe("2026-08-01T00:00:00Z");
  });

  it("detecta ocorrência em aberto em pedido passado", () => {
    const h = resumoHistoricoCliente(
      [row({ id: "atual" }), row({ id: "a", ocorrencias_abertas: 2 })],
      "atual",
    );
    expect(h.tem_ocorrencia_aberta).toBe(true);
  });

  it("normaliza CNPJ para agrupar por dígitos", () => {
    expect(soDigitos("34.479.558/0001-13")).toBe("34479558000113");
    expect(soDigitos(null)).toBe("");
  });
});
