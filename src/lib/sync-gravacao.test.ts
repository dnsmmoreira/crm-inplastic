import { describe, it, expect, vi } from "vitest";
import { gravarNovosEExistentes } from "@/lib/sync-gravacao";

type Item = { id: string; novo: boolean };

function cenario(erroUpdate: unknown = null, erroInsert: unknown = null) {
  const inserir = vi.fn(async () => ({ error: erroInsert }));
  const atualizar = vi.fn(async () => ({ error: erroUpdate }));
  return {
    inserir,
    atualizar,
    run: (itens: Item[]) =>
      gravarNovosEExistentes<Item>({
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
    const c = cenario({ code: "42501" });
    const r = await c.run([
      { id: "b", novo: false },
      { id: "c", novo: false },
    ]);
    expect(r.error).toEqual({ code: "42501" });
    expect(c.atualizar).toHaveBeenCalledTimes(1);
  });

  it("erro no INSERT nem chega nos updates", async () => {
    const c = cenario(null, { code: "23505" });
    const r = await c.run([
      { id: "a", novo: true },
      { id: "b", novo: false },
    ]);
    expect(r.error).toEqual({ code: "23505" });
    expect(c.atualizar).not.toHaveBeenCalled();
  });
});
