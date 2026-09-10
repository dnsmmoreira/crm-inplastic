import { describe, it, expect } from "vitest";
import {
  leadCobravel,
  leadCobravelPosVenda,
  leadsEncerrados,
  SQL_STAGES_ENCERRADOS,
} from "./lead-elegivel";

describe("leadCobravel", () => {
  it("bloqueia ganho e perdido", () => {
    expect(leadCobravel("perdido")).toBe(false);
    expect(leadCobravel("ganho")).toBe(false);
  });
  it("libera etapas ativas e etapa desconhecida", () => {
    for (const s of ["novo", "atendimento", "qualificacao", "proposta", "negociacao"]) {
      expect(leadCobravel(s)).toBe(true);
    }
    expect(leadCobravel(null)).toBe(true);
  });
  it("pós-venda roda no ganho, nunca no perdido", () => {
    expect(leadCobravelPosVenda("ganho")).toBe(true);
    expect(leadCobravelPosVenda("perdido")).toBe(false);
  });
  it("expõe o filtro do PostgREST", () => {
    expect(SQL_STAGES_ENCERRADOS).toBe("(ganho,perdido)");
  });
});

describe("leadsEncerrados", () => {
  function sbFake(rows: Array<{ id: string; stage: string }>) {
    const chain: any = {
      select: () => chain,
      in: (col: string, vals: string[]) => {
        if (col === "id") chain._ids = vals;
        else chain._stages = vals;
        return chain;
      },
      then: undefined,
    };
    chain.from = () => chain;
    // resolve quando aguardado
    chain.then = (res: (v: any) => void) =>
      res({
        data: rows.filter((r) => chain._ids.includes(r.id) && chain._stages.includes(r.stage)),
      });
    return chain;
  }

  it("devolve vazio sem ids", async () => {
    expect((await leadsEncerrados(sbFake([]), [null, undefined])).size).toBe(0);
  });

  it("marca só os encerrados", async () => {
    const sb = sbFake([
      { id: "a", stage: "perdido" },
      { id: "b", stage: "proposta" },
    ]);
    const set = await leadsEncerrados(sb, ["a", "b"]);
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(false);
  });
});
