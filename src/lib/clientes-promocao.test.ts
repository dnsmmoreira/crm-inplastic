import { describe, it, expect } from "vitest";
import { garantirClienteDoLead } from "./clientes.functions";

/**
 * Fake mínimo do client Supabase (encadeável) para exercitar
 * `garantirClienteDoLead` sem tocar no banco real.
 */
type LeadRow = Record<string, unknown>;

function makeSupabase(opts: {
  lead: LeadRow;
  clientes?: Array<Record<string, unknown>>;
  cnpjStatus?: { existe: boolean; ativo: boolean; mesmo_vendedor: boolean; cliente_id: string | null };
  novoClienteId?: string;
}) {
  const state = {
    lead: { ...opts.lead },
    clientes: opts.clientes ? [...opts.clientes] : [],
    interactions: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    pendingInsert: undefined as Record<string, unknown> | undefined,
  };

  function builder(table: string) {
    const ctx: { filters: Record<string, unknown> } = { filters: {} };
    const api: Record<string, unknown> = {};
    const chain = () => api;

    Object.assign(api, {
      select: chain,
      order: chain,
      limit: chain,
      ilike: chain,
      eq: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return api;
      },
      maybeSingle: async () => {
        if (table === "leads") return { data: state.lead, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (table === "clientes") {
          const novo = { id: opts.novoClienteId ?? "cliente-novo", ...(state.pendingInsert ?? {}) };
          state.clientes.push(novo);
          return { data: novo, error: null };
        }
        return { data: null, error: null };
      },
      insert: (payload: Record<string, unknown>) => {
        if (table === "lead_interactions") {
          state.interactions.push(payload);
          return Promise.resolve({ data: null, error: null });
        }
        state.pendingInsert = payload;
        return api;
      },
      update: (payload: Record<string, unknown>) => {
        state.updates.push(payload);
        if (table === "leads") Object.assign(state.lead, payload);
        return {
          eq: async () => ({ data: null, error: null }),
        };
      },
      then: undefined,
    });

    // `select` sem maybeSingle (lista) — usado na busca por CPF
    (api as { select: (c?: string) => unknown }).select = () => {
      if (table === "clientes") {
        return {
          ilike: () => ({
            limit: async () => ({ data: state.clientes, error: null }),
          }),
          eq: () => api,
          order: () => api,
          limit: async () => ({ data: state.clientes, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      return api;
    };

    return api;
  }

  return {
    state,
    from: (table: string) => builder(table),
    rpc: async (name: string) => {
      if (name === "cnpj_status") {
        return {
          data: opts.cnpjStatus ? [opts.cnpjStatus] : [{ existe: false, ativo: false, mesmo_vendedor: false, cliente_id: null }],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  } as unknown as { state: typeof state } & Record<string, unknown>;
}

const CNPJ_VALIDO = "11222333000181";
const USER = "00000000-0000-0000-0000-000000000001";

describe("garantirClienteDoLead", () => {
  it("(a) bloqueia o Ganho quando o lead não tem CNPJ/CPF", async () => {
    const sb = makeSupabase({ lead: { id: "lead-1", cliente_id: null, cnpj: null, company: "ACME" } });
    const r = await garantirClienteDoLead(sb, USER, "lead-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros[0]).toBe("Preencha o CNPJ ou CPF do contato antes de marcar como Ganho.");
    }
  });

  it("(b) cria cliente novo quando o documento é válido e não existe cadastro", async () => {
    const sb = makeSupabase({
      lead: { id: "lead-2", cliente_id: null, cnpj: CNPJ_VALIDO, company: "ACME LTDA", owner_id: USER },
      novoClienteId: "cliente-2",
    });
    const r = await garantirClienteDoLead(sb, USER, "lead-2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criado).toBe(true);
      expect(r.clienteId).toBe("cliente-2");
    }
    // auditoria registrada no mecanismo existente (lead_interactions)
    expect((sb as never as { state: { interactions: unknown[] } }).state.interactions).toHaveLength(1);
  });

  it("(c) vincula ao cliente existente quando o CNPJ já está cadastrado", async () => {
    const sb = makeSupabase({
      lead: { id: "lead-3", cliente_id: null, cnpj: CNPJ_VALIDO, company: "ACME LTDA", owner_id: USER },
      cnpjStatus: { existe: true, ativo: true, mesmo_vendedor: true, cliente_id: "cliente-existente" },
    });
    const r = await garantirClienteDoLead(sb, USER, "lead-3");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criado).toBe(false);
      expect(r.clienteId).toBe("cliente-existente");
    }
  });

  it("(d) é idempotente: lead já vinculado não cria outro cliente", async () => {
    const sb = makeSupabase({
      lead: { id: "lead-4", cliente_id: "cliente-4", cnpj: CNPJ_VALIDO, company: "ACME" },
    });
    const r = await garantirClienteDoLead(sb, USER, "lead-4");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criado).toBe(false);
      expect(r.jaVinculado).toBe(true);
      expect(r.clienteId).toBe("cliente-4");
    }
    expect((sb as never as { state: { clientes: unknown[] } }).state.clientes).toHaveLength(0);
  });
});
