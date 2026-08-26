import { describe, it, expect } from "vitest";
import { garantirClienteDoLead } from "./clientes.functions";

type Row = Record<string, unknown>;

/** Fake supabase com suporte a `.or()` para exercitar o auto-match. */
function makeSupabase(lead: Row, clientes: Row[]) {
  const state = { lead: { ...lead }, clientes, updates: [] as Row[], interactions: [] as Row[] };

  function builder(table: string) {
    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select: () => api,
      or: () => api,
      eq: () => api,
      ilike: () => api,
      order: () => api,
      limit: async () => ({
        data: table === "clientes" ? state.clientes : [],
        error: null,
      }),
      maybeSingle: async () => ({ data: table === "leads" ? state.lead : null, error: null }),
      insert: (payload: Row) => {
        if (table === "lead_interactions") state.interactions.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
      update: (payload: Row) => {
        state.updates.push(payload);
        if (table === "leads") Object.assign(state.lead, payload);
        return { eq: async () => ({ data: null, error: null }) };
      },
    });
    return api;
  }

  return {
    state,
    from: (t: string) => builder(t),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as { state: typeof state } & Record<string, unknown>;
}

const USER = "00000000-0000-0000-0000-000000000001";

describe("garantirClienteDoLead — auto-match sem CNPJ no lead", () => {
  it("vincula quando o telefone do lead bate com exatamente 1 cliente", async () => {
    const sb = makeSupabase(
      { id: "lead-1", cliente_id: null, cnpj: null, company: "SIAL FILTROS", phone: "(11) 98765-4321" },
      [{ id: "cli-1", cnpj: "12452922000119", telefone: "11987654321", razao_social: "SIAL FILTROS LTDA" }],
    );
    const r = await garantirClienteDoLead(sb, USER, "lead-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clienteId).toBe("cli-1");
    expect((sb as never as { state: { lead: Row } }).state.lead["cliente_id"]).toBe("cli-1");
  });

  it("vincula por razão social exatamente igual", async () => {
    const sb = makeSupabase(
      { id: "lead-2", cliente_id: null, cnpj: null, company: "Acme Indústria" },
      [{ id: "cli-2", cnpj: "12452922000119", razao_social: "ACME INDUSTRIA" }],
    );
    const r = await garantirClienteDoLead(sb, USER, "lead-2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clienteId).toBe("cli-2");
  });

  it("mantém o bloqueio quando há mais de 1 candidato", async () => {
    const sb = makeSupabase(
      { id: "lead-3", cliente_id: null, cnpj: null, email: "x@y.com" },
      [
        { id: "cli-a", cnpj: "12452922000119", email: "x@y.com" },
        { id: "cli-b", cnpj: "11222333000181", email: "X@Y.COM" },
      ],
    );
    const r = await garantirClienteDoLead(sb, USER, "lead-3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toMatch(/CNPJ ou CPF/i);
  });

  it("mantém o bloqueio quando não há nenhum match", async () => {
    const sb = makeSupabase(
      { id: "lead-4", cliente_id: null, cnpj: null, company: "DESCONHECIDA", phone: "11 3333-1111" },
      [{ id: "cli-z", cnpj: "12452922000119", telefone: "11999990000", razao_social: "OUTRA EMPRESA" }],
    );
    const r = await garantirClienteDoLead(sb, USER, "lead-4");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toMatch(/CNPJ ou CPF/i);
  });
});
