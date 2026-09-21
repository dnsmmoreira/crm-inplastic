import { describe, expect, it } from "vitest";
import { resolverEscopo } from "@/lib/relatorios.functions";

/** Client mínimo: responde `tem_permissao` conforme as chaves concedidas. */
function sbCom(chaves: string[]) {
  const chamadas: string[] = [];
  return {
    chamadas,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "tem_permissao") throw new Error(`rpc inesperada: ${fn}`);
      const chave = String(args["_chave"]);
      chamadas.push(chave);
      return { data: chaves.includes(chave), error: null };
    },
  };
}

describe("resolverEscopo", () => {
  it("quem tem pedidos.ver_todos vê tudo (sem consultar ver_equipe)", async () => {
    const sb = sbCom(["pedidos.ver_todos"]);
    expect(await resolverEscopo(sb, "u1")).toBe("todos");
    expect(sb.chamadas).toEqual(["pedidos.ver_todos"]);
  });

  it("quem só tem pedidos.ver_equipe fica no escopo de equipe", async () => {
    const sb = sbCom(["pedidos.ver_equipe"]);
    expect(await resolverEscopo(sb, "u2")).toBe("equipe");
    expect(sb.chamadas).toEqual(["pedidos.ver_todos", "pedidos.ver_equipe"]);
  });

  it("sem nenhuma das duas, fica no próprio (fail-closed)", async () => {
    expect(await resolverEscopo(sbCom([]), "u3")).toBe("proprio");
  });

  it("ver_todos tem precedência sobre ver_equipe", async () => {
    const sb = sbCom(["pedidos.ver_todos", "pedidos.ver_equipe"]);
    expect(await resolverEscopo(sb, "u4")).toBe("todos");
  });
});
