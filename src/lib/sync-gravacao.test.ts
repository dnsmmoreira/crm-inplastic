import { describe, it, expect, vi } from "vitest";
import { gravarNovosEExistentes, erroRecusaSilenciosa } from "@/lib/sync-gravacao";

type Item = { id: string; novo: boolean };

function cenario(opts?: {
  erroUpdate?: unknown;
  erroInsert?: unknown;
  /** linhas devolvidas pelo `.select("id")` do update (0 = recusa silenciosa) */
  linhasUpdate?: unknown[];
}) {
  const inserir = vi.fn(async () => ({ error: opts?.erroInsert ?? null }));
  const atualizar = vi.fn(async () => ({
    error: opts?.erroUpdate ?? null,
    data: opts?.linhasUpdate ?? [{ id: "x" }],
  }));
  return {
    inserir,
    atualizar,
    run: (itens: Item[]) =>
      gravarNovosEExistentes<Item>({
        tabela: "leads",
        itens,
        id: (i) => i.id,
        ehNovo: (i) => i.novo,
        payloadNovo: (i) => ({ id: i.id, owner_id: "dono" }),
        payloadExistente: (i) => ({ id: i.id, notes: "x" }),
        inserir,
        atualizar,
      }),
  };
}

describe("gravação do motor de sync", () => {
  it("registro novo vai por INSERT, levando o dono", async () => {
    const c = cenario();
    await c.run([{ id: "a", novo: true }]);
    expect(c.inserir).toHaveBeenCalledWith([{ id: "a", owner_id: "dono" }]);
    expect(c.atualizar).not.toHaveBeenCalled();
  });

  it("registro existente vai por UPDATE por id — nunca upsert", async () => {
    const c = cenario();
    await c.run([{ id: "b", novo: false }]);
    expect(c.inserir).not.toHaveBeenCalled();
    // o id sai do corpo: vira filtro, não coluna gravada
    expect(c.atualizar).toHaveBeenCalledWith("b", { notes: "x" });
  });

  it("lote misto: um INSERT em lote e um UPDATE por registro existente", async () => {
    const c = cenario();
    await c.run([
      { id: "a", novo: true },
      { id: "b", novo: false },
      { id: "c", novo: false },
    ]);
    expect(c.inserir).toHaveBeenCalledTimes(1);
    expect(c.atualizar).toHaveBeenCalledTimes(2);
  });

  it("devolve o primeiro erro e para de gravar", async () => {
    const c = cenario({ erroUpdate: { code: "42501" } });
    const r = await c.run([
      { id: "b", novo: false },
      { id: "c", novo: false },
    ]);
    expect(r.error).toEqual({ code: "42501" });
    expect(c.atualizar).toHaveBeenCalledTimes(1);
  });

  it("erro no INSERT nem chega nos updates", async () => {
    const c = cenario({ erroInsert: { code: "23505" } });
    const r = await c.run([
      { id: "a", novo: true },
      { id: "b", novo: false },
    ]);
    expect(r.error).toEqual({ code: "23505" });
    expect(c.atualizar).not.toHaveBeenCalled();
  });
});

describe("recusa silenciosa da RLS (UPDATE sem erro e sem linhas)", () => {
  it("zero linhas vira erro 42501 com o id, em vez de 'salvo'", async () => {
    const c = cenario({ linhasUpdate: [] });
    const r = await c.run([{ id: "b", novo: false }]);
    expect(r.error).toEqual(erroRecusaSilenciosa("leads", ["b"]));
    expect((r.error as { code: string }).code).toBe("42501");
    expect((r.error as { ids: string[] }).ids).toEqual(["b"]);
  });

  it("data nulo (sem select) também é tratado como recusa — nunca como sucesso", async () => {
    const c = cenario({ linhasUpdate: undefined });
    const atualizar = vi.fn(async () => ({ error: null, data: null }));
    const r = await gravarNovosEExistentes<Item>({
      tabela: "propostas",
      itens: [{ id: "p1", novo: false }],
      id: (i) => i.id,
      ehNovo: (i) => i.novo,
      payloadNovo: (i) => ({ id: i.id }),
      payloadExistente: (i) => ({ id: i.id }),
      inserir: c.inserir,
      atualizar,
    });
    expect((r.error as { code: string }).code).toBe("42501");
  });

  it("para no primeiro registro recusado", async () => {
    const c = cenario({ linhasUpdate: [] });
    await c.run([
      { id: "b", novo: false },
      { id: "c", novo: false },
    ]);
    expect(c.atualizar).toHaveBeenCalledTimes(1);
  });

  it("a mensagem diz que nenhuma linha foi alterada", () => {
    expect(erroRecusaSilenciosa("tarefas", ["t1"]).message).toMatch(/nenhuma linha alterada/i);
  });
});
