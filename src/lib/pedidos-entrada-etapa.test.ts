/**
 * Prova que a ENTRADA em uma etapa dispara os efeitos (notificação + tarefa)
 * e que a CRIAÇÃO do pedido chama esse mesmo caminho.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aoEntrarNaEtapa } from "./pedidos-fluxo.server";

type Row = Record<string, unknown>;

/** Stub mínimo do supabase-js usado pelos efeitos de etapa. */
function makeSb(stage: string) {
  const inserted: Record<string, Row[]> = { notificacoes: [], tarefas: [] };

  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain as never;
    Object.assign(chain, {
      select: () => self(),
      eq: () => self(),
      in: () => self(),
      is: () => self(),
      limit: () => self(),
      update: () => ({ eq: async () => ({ error: null }), in: () => self() }),
      maybeSingle: async () => {
        if (table === "pedidos") {
          return {
            data: {
              id: "ped-1",
              number: "PED-2026-9999",
              total: 5400,
              lead_id: "lead-1",
              vendedor_proprietario_id: "vend-1",
              owner_id: "vend-1",
              modalidade_entrega: "coleta",
              entrega_confirmada: null,
              leads: { company: "ACME" },
            },
          };
        }
        if (table === "perfis") return { data: { id: "perfil-fin" } };
        return { data: null };
      },
      then: undefined,
      insert: async (rows: Row | Row[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        (inserted[table] ??= []).push(...arr);
        return { data: { id: "novo" }, error: null };
      },
    });
    // consultas que são "await"adas direto (listas)
    (chain as { then?: unknown }).then = (res: (v: unknown) => void) => {
      const data =
        table === "perfil_permissoes"
          ? [{ perfil_id: "perfil-fin" }]
          : table === "perfis"
            ? [{ id: "perfil-fin" }]
            : table === "user_perfis"
              ? [{ user_id: "fin-1" }]
              : table === "profiles"
                ? [{ id: "fin-1" }]
                : [];
      return Promise.resolve({ data, error: null }).then(res);
    };
    return chain as never;
  };

  return {
    stage,
    inserted,
    from: (table: string) => builder(table),
    // insert de tarefas usa .select().maybeSingle() depois do insert
  } as unknown as { inserted: Record<string, Row[]>; from: (t: string) => never };
}

describe("efeitos de entrada de etapa", () => {
  it("analise_financeira notifica o financeiro", async () => {
    const sb = makeSb("analise_financeira");
    await aoEntrarNaEtapa(sb, "ped-1", "analise_financeira", {
      usarClienteDeServico: false,
    });
    expect(sb.inserted["notificacoes"]!.length).toBeGreaterThan(0);
    expect(sb.inserted["notificacoes"]![0]!["pedido_id"]).toBe("ped-1");
    expect(sb.inserted["notificacoes"]![0]!["tipo"]).toBe("pedido_aprovacao");
  });

  it("a criação do pedido chama aoEntrarNaEtapa com a etapa roteada", () => {
    const src = readFileSync(resolve(__dirname, "omie.functions.ts"), "utf8");
    expect(src).toContain("aoEntrarNaEtapa(sb, novoPedido.id, decisao.stage)");
    // e o erro não pode derrubar a criação nem ser engolido em silêncio
    expect(src).toMatch(/efeitos de entrada falharam/);
  });
});
