/**
 * Prova que a ENTRADA em uma etapa dispara os efeitos (notificação + tarefa)
 * e que a CRIAÇÃO do pedido chama esse mesmo caminho.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aoEntrarNaEtapa } from "./pedidos-fluxo.server";

type Row = Record<string, unknown>;

const PEDIDO = {
  id: "ped-1",
  number: "PED-2026-9999",
  total: 5400,
  lead_id: "lead-1",
  vendedor_proprietario_id: "vend-1",
  owner_id: "vend-1",
  modalidade_entrega: "coleta",
  entrega_confirmada: null,
  leads: { company: "ACME" },
};

/** Stub encadeável mínimo do supabase-js usado pelos efeitos de etapa. */
function makeSb() {
  const inserted: Record<string, Row[]> = { notificacoes: [], tarefas: [] };

  function listaDe(table: string): Row[] {
    switch (table) {
      case "perfil_permissoes":
        return [{ perfil_id: "perfil-fin" }];
      case "perfis":
        return [{ id: "perfil-fin" }];
      case "user_perfis":
        return [{ user_id: "fin-1" }];
      case "profiles":
        return [{ id: "fin-1" }];
      default:
        return [];
    }
  }

  function chain(table: string) {
    const c: Record<string, unknown> = {};
    const passthrough = ["select", "eq", "in", "is", "neq", "gte", "limit", "order", "update"];
    for (const m of passthrough) c[m] = () => c;
    c["maybeSingle"] = async () => ({
      data: table === "pedidos" ? PEDIDO : table === "perfis" ? { id: "perfil-fin" } : null,
      error: null,
    });
    c["single"] = c["maybeSingle"];
    c["insert"] = (rows: Row | Row[]) => {
      (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
      const after: Record<string, unknown> = {};
      after["select"] = () => after;
      after["maybeSingle"] = async () => ({ data: { id: "novo" }, error: null });
      (after as { then: unknown })["then"] = (res: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(res);
      return after;
    };
    (c as { then: unknown })["then"] = (res: (v: unknown) => void) =>
      Promise.resolve({ data: listaDe(table), error: null }).then(res);
    return c;
  }

  return {
    inserted,
    from: (table: string) => chain(table) as never,
  };
}

describe("efeitos de entrada de etapa", () => {
  it("analise_financeira notifica o financeiro e cria a tarefa", async () => {
    const sb = makeSb();
    await aoEntrarNaEtapa(sb, "ped-1", "analise_financeira", {
      usarClienteDeServico: false,
    });
    const notifs = sb.inserted["notificacoes"]!;
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0]!["pedido_id"]).toBe("ped-1");
    expect(notifs[0]!["tipo"]).toBe("pedido_aprovacao");
    expect(sb.inserted["tarefas"]!.length).toBeGreaterThan(0);
  });

  it("a criação do pedido chama aoEntrarNaEtapa com a etapa roteada", () => {
    const src = readFileSync(resolve(__dirname, "omie.functions.ts"), "utf8");
    expect(src).toContain("aoEntrarNaEtapa(sb, novoPedido.id, decisao.stage)");
    expect(src).toMatch(/efeitos de entrada falharam/);
  });
});
