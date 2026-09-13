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

  // Regressão: o CRM grava a UF dentro do endereço; sem este fallback o pedido
  // nascia sem DIFAL e menor que o total aprovado na proposta.
  it("lê a UF de dentro do endereço quando a coluna estado está vazia", async () => {
    const sb = sbFake({ lead: { estado: null, endereco: { uf: "ES" }, cliente_id: null } });
    const r = await difalDoDestinatario(sb, { leadId: "lead-1", valorOperacao: 1000 });
    expect(r.uf).toBe("ES");
    expect(r.valor).toBeCloseTo(134.82, 2);
  });

  it("o cadastro do cliente manda mais que o do lead", async () => {
    const sb = sbFake({
      lead: { estado: "SP", cliente_id: "c1" },
      cliente: { estado: "ES", inscricao_estadual: null, ie_isento: false },
    });
    const r = await difalDoDestinatario(sb, { leadId: "lead-1", valorOperacao: 1000 });
    expect(r.uf).toBe("ES");
  });

  it("sem UF nenhuma não cobra DIFAL (a geração do pedido barra antes)", async () => {
    const sb = sbFake({ lead: { estado: null, endereco: null, cliente_id: null } });
    const r = await difalDoDestinatario(sb, { leadId: "lead-1", valorOperacao: 1000 });
    expect(r.valor).toBe(0);
  });
});

describe("geração do pedido", () => {
  it("barra a geração quando o destinatário está sem UF", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/pedidos-gerar.functions.ts", "utf8");
    expect(src).toContain("if (!ufValida(fiscais.uf))");
    expect(src).toContain("difalDoDestinatario(sb, { leadId, valorOperacao, fiscais })");
  });
});
