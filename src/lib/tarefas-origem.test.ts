import { describe, expect, it } from "vitest";
import { ORIGENS_TAREFA, ORIGEM_TAREFA_RECUSA_PROPOSTA } from "./tarefas-origem";

describe("origens de tarefa", () => {
  it("bate com o CHECK do banco", () => {
    expect([...ORIGENS_TAREFA]).toEqual(["manual", "xerife", "pedido_fluxo", "proposta_fluxo"]);
  });
  it("a recusa de proposta usa proposta_fluxo, que pertence à lista", () => {
    expect(ORIGENS_TAREFA).toContain("proposta_fluxo");
    expect(ORIGEM_TAREFA_RECUSA_PROPOSTA).toBe("proposta_fluxo");
    expect(ORIGENS_TAREFA as readonly string[]).toContain(ORIGEM_TAREFA_RECUSA_PROPOSTA);
  });
});
