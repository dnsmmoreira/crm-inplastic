import { describe, it, expect } from "vitest";
import { criarPropostaDuplicada, normalizarItens, normalizarParcelas } from "./propostas-duplicar.server";

function fakeClient(capture: Record<string, unknown[]>) {
  return {
    rpc: async () => ({ data: "2026-0100", error: null }),
    from(table: string) {
      return {
        insert(rows: unknown) {
          capture[table] = (capture[table] ?? []).concat(rows as never);
          return {
            select: () => ({
              single: async () => ({ data: { id: "novo-id", number: "2026-0100" }, error: null }),
            }),
            then: undefined,
            // insert sem .select() (itens/parcelas)
            error: null,
          } as never;
        },
      } as never;
    },
  };
}

describe("duplicação de proposta", () => {
  it("normaliza itens mantendo NCM e posição", () => {
    const itens = normalizarItens([
      { sku: "A", ncm: "39269090", description: "Peça", unit: "un", quantity: "3", unit_price: "10.5", product_id: null },
    ]);
    expect(itens[0]).toMatchObject({ sku: "A", ncm: "39269090", quantity: 3, unit_price: 10.5, position: 0 });
  });

  it("normaliza parcelas preservando percentual nulo", () => {
    const p = normalizarParcelas([{ days: 30, amount: 100, percentual: null, notes: "", position: 2 }]);
    expect(p[0]).toMatchObject({ days: 30, amount: 100, percentual: null, position: 2 });
  });

  it("cria rascunho com número novo, owner atual e campos de ciclo zerados", async () => {
    const cap: Record<string, unknown[]> = {};
    const sb = fakeClient(cap) as never;
    const res = await criarPropostaDuplicada(sb, {
      base: {
        lead_id: "lead-1",
        emitter_id: "em-1",
        payment_term_id: null,
        forma_pagamento: "pix",
        discount_percent: 5,
        transport: {},
        observations: "obs",
        validity_days: 15,
      },
      itens: [],
      parcelas: [],
      ownerId: "user-9",
    });
    expect(res).toEqual({ id: "novo-id", number: "2026-0100" });
    const inserida = cap["propostas"]![0] as Record<string, unknown>;
    expect(inserida["status"]).toBe("rascunho");
    expect(inserida["owner_id"]).toBe("user-9");
    expect(inserida["number"]).toBe("2026-0100");
    expect(inserida["sent_at"]).toBeNull();
    expect(inserida["order_created_at"]).toBeNull();
    expect(inserida["approval_requested_at"]).toBeNull();
    expect(inserida["edit_unlocked_at"]).toBeNull();
  });
});
