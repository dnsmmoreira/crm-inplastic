import { describe, expect, it } from "vitest";
import {
  diasCorridosDesde,
  diasVencida,
  faixaVencimento,
  rotuloRolagens,
  vencidaHa,
} from "./tarefa-vencimento";

const now = new Date("2026-09-10T12:00:00Z");

describe("tarefa-vencimento", () => {
  it("conta dias corridos só no passado", () => {
    expect(diasCorridosDesde("2026-09-07T12:00:00Z", now)).toBe(3);
    expect(diasCorridosDesde("2026-09-20T12:00:00Z", now)).toBe(0);
    expect(diasCorridosDesde(null, now)).toBe(0);
  });

  it("usa as rolagens quando o due_date foi empurrado para o futuro", () => {
    const t = { escalonamentos: 5, due_date: "2026-09-11T12:00:00Z" };
    expect(diasVencida(t, now)).toBe(5);
    expect(vencidaHa(t, 2, now)).toBe(true);
  });

  it("usa a data quando ela é pior que as rolagens", () => {
    expect(diasVencida({ escalonamentos: 1, due_date: "2026-09-01T12:00:00Z" }, now)).toBe(9);
  });

  it("tarefa nova não está vencida", () => {
    const t = { escalonamentos: 0, due_date: "2026-09-10T18:00:00Z" };
    expect(diasVencida(t, now)).toBe(0);
    expect(vencidaHa(t, 1, now)).toBe(false);
  });

  it("faixas", () => {
    expect(faixaVencimento({ escalonamentos: 0 }, now)).toBe("0");
    expect(faixaVencimento({ escalonamentos: 1 }, now)).toBe("1");
    expect(faixaVencimento({ escalonamentos: 3 }, now)).toBe("2-4");
    expect(faixaVencimento({ escalonamentos: 9 }, now)).toBe("5+");
  });

  it("rótulo de rolagens", () => {
    expect(rotuloRolagens(0)).toBe("");
    expect(rotuloRolagens(null)).toBe("");
    expect(rotuloRolagens(3)).toBe("rolou 3×");
  });
});
