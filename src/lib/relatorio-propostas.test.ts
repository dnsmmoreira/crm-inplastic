import { describe, expect, it } from "vitest";
import {
  agruparMotivos,
  resumirPorVendedor,
  resumirPropostas,
  type PropostaMetricaRow,
} from "./relatorio-propostas";

function row(p: Partial<PropostaMetricaRow>): PropostaMetricaRow {
  return {
    id: "p",
    owner_id: "v1",
    status: "enviada",
    total: 100,
    created_at: "2026-01-01T00:00:00Z",
    sent_at: "2026-01-01T00:00:00Z",
    recusada_em: null,
    order_created_at: null,
    motivo_recusa: null,
    ...p,
  };
}

describe("relatório de propostas", () => {
  const rows = [
    row({ id: "1", status: "pedido", total: 1000, order_created_at: "2026-01-06T00:00:00Z" }),
    row({ id: "2", status: "recusada", total: 500, recusada_em: "2026-01-03T00:00:00Z", motivo_recusa: "Preço" }),
    row({ id: "3", status: "enviada", total: 300 }),
    row({ id: "4", owner_id: "v2", status: "recusada", total: 200, recusada_em: "2026-01-02T00:00:00Z", motivo_recusa: "Concorrente" }),
  ];

  it("conta grupos, conversão e valores", () => {
    const r = resumirPropostas(rows);
    expect(r.viraram_pedido).toBe(1);
    expect(r.recusadas).toBe(2);
    expect(r.em_aberto).toBe(1);
    expect(r.valor_recusado).toBe(700);
    expect(r.conversao_pct).toBeCloseTo((1 / 3) * 100);
    expect(r.dias_medio_ate_pedido).toBe(5);
    expect(r.dias_medio_ate_recusa).toBe(1.5);
  });

  it("sem decididas, conversão é null", () => {
    expect(resumirPropostas([row({ status: "enviada" })]).conversao_pct).toBeNull();
  });

  it("agrupa motivos em ordem canônica com valor perdido", () => {
    const m = agruparMotivos(rows);
    expect(m.map((x) => x.motivo)).toEqual(["Preço", "Concorrente"]);
    expect(m[0]!.valor).toBe(500);
  });

  it("agrupa por vendedor ordenando por valor de pedido", () => {
    const v = resumirPorVendedor(rows);
    expect(v[0]!.owner_id).toBe("v1");
    expect(v[1]!.resumo.recusadas).toBe(1);
  });
});
