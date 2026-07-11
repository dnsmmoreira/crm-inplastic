import { describe, it, expect } from "vitest";
import {
  spNow,
  endOfTodaySpIso,
  startOfTodaySpIso,
  nextBusinessDay9amIso,
  computeRollover,
} from "@/lib/xerife/rollover.server";

/** Constrói um instante UTC. */
const U = (iso: string) => new Date(iso);

describe("D3 — janela do dia em America/Sao_Paulo", () => {
  it("spNow desloca UTC em -3h", () => {
    const now = U("2026-07-10T21:30:00.000Z"); // 18:30 SP
    const sp = spNow(now);
    expect(sp.getUTCHours()).toBe(18);
    expect(sp.getUTCMinutes()).toBe(30);
    expect(sp.getUTCDate()).toBe(10);
  });

  it("cron das 18h BRT (21:00 UTC) → janela do dia é 10/07 em SP", () => {
    const now = U("2026-07-10T21:00:00.000Z");
    expect(startOfTodaySpIso(now)).toBe("2026-07-10T03:00:00.000Z"); // 00:00 SP
    expect(endOfTodaySpIso(now)).toBe("2026-07-11T02:59:59.999Z");   // 23:59:59.999 SP
  });

  it("perto da meia-noite UTC (21:30 SP) ainda é o mesmo dia SP", () => {
    const now = U("2026-07-11T00:30:00.000Z"); // 21:30 SP dia 10
    expect(startOfTodaySpIso(now)).toBe("2026-07-10T03:00:00.000Z");
    expect(endOfTodaySpIso(now)).toBe("2026-07-11T02:59:59.999Z");
  });

  it("tarefa de 09/07 12:00Z entra na janela de fechamento de 10/07", () => {
    const now = U("2026-07-10T21:00:00.000Z");
    const dueDenis = "2026-07-09T12:00:00.000Z";
    expect(dueDenis <= endOfTodaySpIso(now)).toBe(true);
  });
});

describe("D3 — nextBusinessDay9amIso pula sáb/dom", () => {
  it("quinta → sexta 09:00 SP (12:00 UTC)", () => {
    // 2026-07-09 é quinta
    const now = U("2026-07-09T21:00:00.000Z");
    expect(nextBusinessDay9amIso(now)).toBe("2026-07-10T12:00:00.000Z");
  });

  it("sexta → segunda 09:00 SP", () => {
    // 2026-07-10 é sexta
    const now = U("2026-07-10T21:00:00.000Z");
    expect(nextBusinessDay9amIso(now)).toBe("2026-07-13T12:00:00.000Z");
  });

  it("sábado → segunda 09:00 SP", () => {
    const now = U("2026-07-11T15:00:00.000Z"); // sáb 12:00 SP
    expect(nextBusinessDay9amIso(now)).toBe("2026-07-13T12:00:00.000Z");
  });

  it("domingo → segunda 09:00 SP", () => {
    const now = U("2026-07-12T15:00:00.000Z");
    expect(nextBusinessDay9amIso(now)).toBe("2026-07-13T12:00:00.000Z");
  });
});

describe("D3 — computeRollover", () => {
  const fri = U("2026-07-10T21:00:00.000Z");

  it("caso Denis (P3, esc 0, sexta) → segunda, esc 1, P2", () => {
    const patch = computeRollover({ prioridade: 3, escalonamentos: 0 }, fri);
    expect(patch).toEqual({
      due_date: "2026-07-13T12:00:00.000Z",
      escalonamentos: 1,
      prioridade: 2,
      status: "pendente",
    });
  });

  it("prioridade mínima é 1 (não desce abaixo)", () => {
    const patch = computeRollover({ prioridade: 1, escalonamentos: 4 }, fri);
    expect(patch.prioridade).toBe(1);
    expect(patch.escalonamentos).toBe(5);
  });

  it("defaults quando campos null/undefined", () => {
    const patch = computeRollover({ prioridade: null, escalonamentos: null }, fri);
    expect(patch.prioridade).toBe(2); // default 3 → 2
    expect(patch.escalonamentos).toBe(1);
  });
});
