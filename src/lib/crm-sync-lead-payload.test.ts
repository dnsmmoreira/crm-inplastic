/**
 * Campos que só mudam por ação explícita nunca podem ir no save genérico de um
 * lead existente — foi assim que o fechamento do lead "Ricardo…" foi revertido
 * por uma aba com cópia antiga (ganho → proposta 51 min depois).
 */
import { describe, expect, it } from "vitest";
import { leadToInsert } from "@/lib/crm-sync";
import type { Lead } from "@/lib/crm-store";

const lead = {
  id: "3b623276-d544-43b3-8628-33b61534c2bd",
  company: "Ricardo Enrique",
  contactName: "Ricardo",
  email: "",
  phone: "",
  product: "",
  quantity: 0,
  estimatedValue: 0,
  stage: "proposta",
  tags: [],
  source: "",
  createdAt: new Date().toISOString(),
  lastContact: new Date().toISOString(),
  nextFollowUp: new Date().toISOString(),
  notes: "",
  ownerId: "11111111-1111-1111-1111-111111111111",
  interactions: [],
} as unknown as Lead;

describe("payload de lead", () => {
  it("lead novo leva etapa, dono e reagendamento", () => {
    const p = leadToInsert(lead, { novo: true }) as Record<string, unknown>;
    expect(p["stage"]).toBe("proposta");
    expect(p["owner_id"]).toBeTruthy();
    expect(p["next_followup"]).toBeTruthy();
  });

  it("lead existente não reenvia etapa, dono nem reagendamento", () => {
    const p = leadToInsert(lead, { novo: false }) as Record<string, unknown>;
    expect("stage" in p).toBe(false);
    expect("owner_id" in p).toBe(false);
    expect("next_followup" in p).toBe(false);
    // o resto do cadastro continua sendo salvo normalmente
    expect(p["company"]).toBe("RICARDO ENRIQUE");
  });
});
