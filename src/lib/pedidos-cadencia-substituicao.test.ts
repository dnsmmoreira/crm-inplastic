import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return holder.sb;
  },
}));
import { motivoEncerramento } from "./tarefas-encerramento";

const XERIFE_PEDIDOS = resolve(process.cwd(), "src/routes/api/public/hooks/xerife-pedidos.ts");

describe("cadência substitui o toque anterior", () => {
  const src = readFileSync(XERIFE_PEDIDOS, "utf8");

  it("encerra o toque anterior do mesmo pedido/dono/tipo antes de criar o novo", () => {
    expect(src).toContain("encerrarTarefasDoPedido(");
    expect(src).toContain('motivoEncerramento({ causa: "cadencia_substituida"');
    expect(src).toContain("{ ownerId }");
  });

  it("a tarefa do Xerife de pedido grava pedido_id (dedupe deixa de depender do texto)", () => {
    expect(src).toContain("pedido_id: t.pedidoId,");
    expect(src).toMatch(/\.eq\("pedido_id", pedidoId\)/);
    expect(src).not.toContain('.filter("descricao", "ilike", `%${pedidoId}%`)');
  });

  it("o pós-venda por entrega (R6) saiu do Xerife — um motor por assunto", () => {
    expect(src).not.toContain("pos_venda_pedido_entregue");
    expect(src).not.toContain("pos_venda_entrega");
  });

  it("o encerramento usa update filtrado por pedido, dono, tipo e situação", async () => {
    const calls: Record<string, unknown[][]> = { eq: [], in: [], update: [], filter: [], is: [], not: [] };
    const q: Record<string, (...a: unknown[]) => unknown> = {};
    for (const m of ["update", "eq", "in", "filter", "is", "not"]) {
      q[m] = (...a: unknown[]) => {
        (calls[m] ??= []).push(a);
        return q;
      };
    }
    q.select = vi.fn(async () => ({ data: [{ id: "t1" }], error: null }));
    const sb = { from: vi.fn(() => q) };
    holder.sb = sb;

    const { encerrarTarefasDoPedido } = await import("./pedidos-fluxo.server");
    const n = await encerrarTarefasDoPedido(
      sb,
      "ped-1",
      ["cadencia_producao"],
      motivoEncerramento({ causa: "cadencia_substituida", toque: 2 }),
      { ownerId: "u1" },
    );

    // Duas passadas (com e sem nota) → duas linhas encontradas no mock.
    expect(n).toBe(2);
    expect(calls.is).toContainEqual(["nota_conclusao", null]);
    expect((calls.update[0]![0] as Record<string, unknown>).nota_conclusao).toBe(
      "substituída pelo toque 2",
    );

    const patch = calls.update[0]![0] as Record<string, unknown>;
    expect(patch.status).toBe("concluida");
    expect(patch.desfecho).toBe("automatico");
    expect(patch.desfecho_detalhe).toBe("substituída pelo toque 2");
    expect(calls.eq).toContainEqual(["pedido_id", "ped-1"]);
    expect(calls.eq).toContainEqual(["owner_id", "u1"]);
    expect(calls.in).toContainEqual(["tipo", ["cadencia_producao"]]);
    expect(calls.in).toContainEqual(["status", ["pendente", "adiada"]]);
  });
});
