import { describe, expect, it, vi } from "vitest";

import { redigirContexto, mensagemDeErro, registrarFalha } from "./falhas.server";

/** Client falso mínimo com o encadeamento usado pelo helper. */
function fakeSb(opts: {
  existente?: { id: string; ocorrencias: number } | null;
  insertError?: string;
  updateError?: string;
  selectThrows?: boolean;
}) {
  const calls = { insert: [] as unknown[], update: [] as unknown[] };
  const sb = {
    from() {
      return {
        select() {
          const chain = {
            eq: () => chain,
            is: () => chain,
            limit: () => chain,
            maybeSingle: async () => {
              if (opts.selectThrows) throw new Error("conexão caiu");
              return { data: opts.existente ?? null };
            },
          };
          return chain;
        },
        insert: async (row: unknown) => {
          calls.insert.push(row);
          return { error: opts.insertError ? { message: opts.insertError } : null };
        },
        update(row: unknown) {
          calls.update.push(row);
          return {
            eq: async () => ({ error: opts.updateError ? { message: opts.updateError } : null }),
          };
        },
      };
    },
  };
  return { sb, calls };
}

describe("mensagemDeErro", () => {
  it("lê Error, string e objeto com message", () => {
    expect(mensagemDeErro(new Error("boom"))).toBe("boom");
    expect(mensagemDeErro("texto")).toBe("texto");
    expect(mensagemDeErro({ message: "do banco" })).toBe("do banco");
  });
});

describe("redigirContexto", () => {
  it("redige chaves sensíveis em qualquer nível", () => {
    const out = redigirContexto({
      pedido_id: "abc",
      n8n_secret: "xyz",
      Authorization: "Bearer 123",
      dados: { api_key: "k", SENHA: "s", token_meta: "t", etapa: "programacao" },
    }) as Record<string, unknown>;
    expect(out.pedido_id).toBe("abc");
    expect(out.n8n_secret).toBe("[redigido]");
    expect(out.Authorization).toBe("[redigido]");
    const dados = out.dados as Record<string, unknown>;
    expect(dados.api_key).toBe("[redigido]");
    expect(dados.SENHA).toBe("[redigido]");
    expect(dados.token_meta).toBe("[redigido]");
    expect(dados.etapa).toBe("programacao");
  });
});

describe("registrarFalha", () => {
  it("não lança quando a gravação falha", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = fakeSb({ insertError: "permission denied" });
    await expect(registrarFalha(sb, "pedido.tarefa", new Error("x"))).resolves.toBe(false);
    spy.mockRestore();
  });

  it("não lança quando a própria consulta explode", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = fakeSb({ selectThrows: true });
    await expect(registrarFalha(sb, "pedido.etapa", "falhou")).resolves.toBe(false);
    spy.mockRestore();
  });

  it("insere na primeira ocorrência e nunca grava segredo", async () => {
    const { sb, calls } = fakeSb({ existente: null });
    await registrarFalha(sb, "n8n.reenvio", new Error("timeout"), { n8n_token: "abc", id: "1" });
    expect(calls.insert).toHaveLength(1);
    const row = calls.insert[0] as { mensagem: string; contexto: Record<string, unknown> };
    expect(row.mensagem).toBe("timeout");
    expect(row.contexto.n8n_token).toBe("[redigido]");
    expect(row.contexto.id).toBe("1");
  });

  it("incrementa em vez de duplicar na segunda ocorrência igual", async () => {
    const { sb, calls } = fakeSb({ existente: { id: "f1", ocorrencias: 3 } });
    await registrarFalha(sb, "n8n.reenvio", new Error("timeout"));
    expect(calls.insert).toHaveLength(0);
    expect(calls.update).toHaveLength(1);
    expect((calls.update[0] as { ocorrencias: number }).ocorrencias).toBe(4);
  });
});
