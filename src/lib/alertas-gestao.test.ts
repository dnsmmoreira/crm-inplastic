import { describe, expect, it } from "vitest";
import { gestoresParaAlertas } from "@/lib/pedidos-fluxo.server";

type Row = Record<string, unknown>;

/** Stub mínimo do client: filtra tabelas em memória com eq/in/is. */
function stub(tables: Record<string, Row[]>) {
  return {
    from(t: string) {
      let rows = [...(tables[t] ?? [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q),
        then: (res: (x: { data: Row[] }) => unknown) => Promise.resolve({ data: rows }).then(res),
      };
      return q;
    },
  };
}

function base(silenciados: string[] = [], users = ["a", "b", "c"]) {
  return stub({
    perfil_permissoes: [{ perfil_id: "p1", permissao_chave: "usuarios.gerenciar" }],
    perfis: [{ id: "p1", ativo: true }],
    user_perfis: users.map((u) => ({ user_id: u, perfil_id: "p1" })),
    profiles: users.map((id) => ({
      id,
      ativo: true,
      deleted_at: null,
      recebe_alertas_gestao: !silenciados.includes(id),
    })),
  });
}

describe("gestoresParaAlertas", () => {
  it("ninguém silenciado devolve a lista inteira", async () => {
    expect(await gestoresParaAlertas(base())).toEqual(["a", "b", "c"]);
  });
  it("silenciado sai da lista", async () => {
    expect(await gestoresParaAlertas(base(["b"]))).toEqual(["a", "c"]);
  });
  it("sem gestores devolve vazio", async () => {
    expect(await gestoresParaAlertas(base([], []))).toEqual([]);
  });
});
