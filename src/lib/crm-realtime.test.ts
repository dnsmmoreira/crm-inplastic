import { describe, it, expect } from "vitest";
import {
  planejarEventoRealtime,
  mesclarPorId,
  removerPorId,
  type EventoRealtime,
} from "@/lib/crm-realtime";

const nunca = { ehEscritaPropria: () => false };
const sempre = { ehEscritaPropria: () => true };

function ev(p: Partial<EventoRealtime> & { table: string }): EventoRealtime {
  return { eventType: "UPDATE", ...p } as EventoRealtime;
}

describe("planejarEventoRealtime", () => {
  it("INSERT/UPDATE completo vira merge da coleção", () => {
    const row = { id: "l1", company: "ACME", stage: "novo", created_at: "2026-01-01" };
    expect(
      planejarEventoRealtime(ev({ table: "leads", eventType: "INSERT", new: row }), nunca),
    ).toEqual({
      acao: "merge",
      colecao: "leads",
      row,
    });
  });

  it("DELETE remove por old.id", () => {
    expect(
      planejarEventoRealtime(
        ev({ table: "produtos", eventType: "DELETE", old: { id: "p1" } }),
        nunca,
      ),
    ).toEqual({ acao: "remover", colecao: "products", id: "p1" });
  });

  it("eco da escrita da própria aba é ignorado", () => {
    const row = { id: "l1", company: "ACME", stage: "novo", created_at: "2026-01-01" };
    expect(planejarEventoRealtime(ev({ table: "leads", new: row }), sempre)).toEqual({
      acao: "ignorar",
      motivo: "eco da escrita desta aba",
    });
  });

  it("payload incompleto pede recarga só daquela coleção", () => {
    expect(planejarEventoRealtime(ev({ table: "leads", new: { id: "l1" } }), nunca)).toEqual({
      acao: "recarregar",
      colecao: "leads",
    });
    expect(
      planejarEventoRealtime(ev({ table: "produtos", eventType: "DELETE", old: {} }), nunca),
    ).toEqual({ acao: "recarregar", colecao: "products" });
  });

  it("tabela filha recarrega a coleção pai", () => {
    for (const t of ["proposta_itens", "proposta_parcelas"]) {
      expect(planejarEventoRealtime(ev({ table: t, new: { id: "x" } }), nunca)).toEqual({
        acao: "recarregar",
        colecao: "proposals",
      });
    }
    expect(
      planejarEventoRealtime(ev({ table: "lead_interactions", new: { id: "x" } }), nunca),
    ).toEqual({
      acao: "recarregar",
      colecao: "leads",
    });
  });

  it("tabela fora do escopo é ignorada", () => {
    expect(
      planejarEventoRealtime(ev({ table: "whatsapp_mensagens", new: { id: "x" } }), nunca).acao,
    ).toBe("ignorar");
  });
});

describe("mesclarPorId / removerPorId", () => {
  it("substitui existente e adiciona novo no topo", () => {
    const base = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ];
    expect(mesclarPorId(base, { id: "b", v: 9 })).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 9 },
    ]);
    expect(mesclarPorId(base, { id: "c", v: 3 })[0]).toEqual({ id: "c", v: 3 });
  });

  it("remove por id e mantém a referência quando não existe", () => {
    const base = [{ id: "a" }, { id: "b" }];
    expect(removerPorId(base, "a")).toEqual([{ id: "b" }]);
    expect(removerPorId(base, "z")).toBe(base);
  });
});
