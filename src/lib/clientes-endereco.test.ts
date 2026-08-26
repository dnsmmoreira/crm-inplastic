import { describe, it, expect } from "vitest";
import { normalizarTexto } from "./normalizacao";
import { achatarEnderecoLead, garantirClienteDoLead } from "./clientes.functions";

describe("normalizarTexto blindado", () => {
  it("não lança ao receber objeto/número/null", () => {
    expect(() => normalizarTexto({ uf: "PR" } as unknown as string)).not.toThrow();
    expect(normalizarTexto({ uf: "PR" } as unknown as string)).toBe("");
    expect(normalizarTexto(123 as unknown as string)).toBe("123");
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto("  rua  da   paz ")).toBe("RUA DA PAZ");
  });
});

describe("achatarEnderecoLead", () => {
  it("achata jsonb objeto", () => {
    expect(
      achatarEnderecoLead({
        endereco: {
          uf: "PR", cep: "80060160", bairro: "CENTRO", cidade: "CURITIBA",
          numero: "691", logradouro: "RUA DA PAZ", complemento: "",
        },
      }),
    ).toEqual({
      endereco: "RUA DA PAZ", numero: "691", complemento: null,
      bairro: "CENTRO", cep: "80060160", cidade: "CURITIBA", estado: "PR",
    });
  });

  it("mantém string e null", () => {
    expect(achatarEnderecoLead({ endereco: "RUA X", cidade: "SP" }).endereco).toBe("RUA X");
    expect(achatarEnderecoLead({ endereco: null }).endereco).toBeNull();
  });
});

// Fake mínimo: captura o insert em `clientes`.
function makeSupabase(lead: Record<string, unknown>) {
  const state = { lead, inserted: undefined as Record<string, unknown> | undefined };
  function builder(table: string) {
    const api: Record<string, unknown> = {};
    const chain = () => api;
    Object.assign(api, {
      select: chain, order: chain, limit: chain, ilike: chain, eq: chain,
      maybeSingle: async () => ({ data: table === "leads" ? state.lead : null, error: null }),
      single: async () => ({ data: { id: "cli-1", ...(state.inserted ?? {}) }, error: null }),
      insert: (payload: Record<string, unknown>) => {
        if (table === "clientes") state.inserted = payload;
        if (table === "lead_interactions") return Promise.resolve({ data: null, error: null });
        return api;
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    });
    return api;
  }
  return {
    state,
    from: (t: string) => builder(t),
    rpc: async () => ({ data: [{ existe: false, ativo: false, mesmo_vendedor: false, cliente_id: null }], error: null }),
  } as unknown as { state: typeof state } & Record<string, unknown>;
}

describe("garantirClienteDoLead com endereco jsonb", () => {
  it("cria cliente com os campos de endereço populados", async () => {
    const sb = makeSupabase({
      id: "lead-j", cliente_id: null, cnpj: "11222333000181", company: "SIAL FILTROS",
      owner_id: "00000000-0000-0000-0000-000000000001",
      endereco: {
        uf: "PR", cep: "80060160", bairro: "CENTRO", cidade: "CURITIBA",
        numero: "691", logradouro: "RUA DA PAZ", complemento: "",
      },
    });
    const r = await garantirClienteDoLead(sb, "00000000-0000-0000-0000-000000000001", "lead-j");
    expect(r.ok).toBe(true);
    const ins = (sb as never as { state: { inserted: Record<string, unknown> } }).state.inserted;
    expect(ins.endereco).toBe("RUA DA PAZ");
    expect(ins.numero).toBe("691");
    expect(ins.bairro).toBe("CENTRO");
    expect(ins.cidade).toBe("CURITIBA");
    expect(ins.cep).toBe("80060160");
    expect(ins.estado).toBe("PR");
  });
});
