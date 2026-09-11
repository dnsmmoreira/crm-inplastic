/**
 * DIFAL compartilhado entre proposta e pedido — a conta tem que ser a mesma nos
 * dois lugares (o pedido nascia sem DIFAL e o financeiro recebia valor menor).
 */
import { describe, it, expect } from "vitest";
import { difalDoDestinatario } from "@/lib/difal.server";

function sbFake(rows: { lead?: any; cliente?: any; aliquotas?: any[] }) {
  return {
    from(tabela: string) {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({
          data: tabela === "leads" ? (rows.lead ?? null) : (rows.cliente ?? null),
        }),
        then: (res: any) => res({ data: rows.aliquotas ?? [] }),
      };
      return api;
    },
  };
}

describe("difalDoDestinatario", () => {
  it("calcula DIFAL do destino ES sem inscrição estadual (mesmo valor da proposta)", async () => {
    const sb = sbFake({ lead: { estado: "ES", inscricao_estadual: null, cliente_id: null } });
    const r = await difalDoDestinatario(sb, { leadId: "lead-1", valorOperacao: 1000 });
    expect(r.valor).toBeCloseTo(134.82, 2);
    expect(r.uf).toBe("ES");
  });

  it("não cobra DIFAL de destinatário isento de inscrição estadual", async () => {
    const sb = sbFake({
      lead: { estado: "ES", inscricao_estadual: null, cliente_id: "c1" },
      cliente: { estado: "ES", inscricao_estadual: null, ie_isento: true },
    });
    const r = await difalDoDestinatario(sb, { leadId: "lead-1", valorOperacao: 1000 });
    expect(r.valor).toBe(0);
  });

  it("aceita dados fiscais já carregados sem consultar o lead", async () => {
    const sb = sbFake({});
    const r = await difalDoDestinatario(sb, {
      leadId: null,
      valorOperacao: 1000,
      fiscais: { uf: "ES", inscricaoEstadual: null, ieIsento: false },
    });
    expect(r.valor).toBeCloseTo(134.82, 2);
  });
});
