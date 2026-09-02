import { describe, it, expect, vi } from "vitest";
import { assertRpcPermissao, assertNoError, MSG_PERMISSAO_INDISPONIVEL } from "./guard-erros";

vi.mock("@/lib/falhas.server", () => ({
  registrarFalhaAdmin: vi.fn(async () => true),
}));

describe("assertRpcPermissao — fail-closed", () => {
  it("bloqueia quando a RPC de permissão retorna error", async () => {
    await expect(
      assertRpcPermissao({ data: true, error: { message: "boom" } }, "teste/has_role"),
    ).rejects.toThrow(MSG_PERMISSAO_INDISPONIVEL);
  });

  it("usa a mensagem customizada quando informada", async () => {
    await expect(
      assertRpcPermissao(
        { data: null, error: { message: "boom" } },
        "clientes/cnpj_status",
        {},
        "Não foi possível verificar o CNPJ, tente novamente",
      ),
    ).rejects.toThrow("Não foi possível verificar o CNPJ, tente novamente");
  });

  it("nunca libera acesso mesmo quando data vem true junto com error", async () => {
    let liberado = false;
    try {
      liberado = (await assertRpcPermissao(
        { data: true, error: { message: "rpc caiu" } },
        "teste/has_role",
      )) as boolean;
    } catch {
      liberado = false;
    }
    expect(liberado).toBe(false);
  });

  it("devolve o dado no caminho feliz", async () => {
    await expect(assertRpcPermissao({ data: true, error: null }, "teste")).resolves.toBe(true);
  });
});

describe("assertNoError", () => {
  it("lança quando há error", async () => {
    await expect(assertNoError({ error: { message: "falhou" } }, "teste")).rejects.toThrow("falhou");
  });
  it("não lança quando não há error", async () => {
    await expect(assertNoError({ error: null }, "teste")).resolves.toBeUndefined();
  });
});

/** Reproduz a regra do último admin usada em usuarios.functions.ts. */
async function protecaoUltimoAdmin(rpc: { data: unknown; error: unknown }) {
  const count = await assertRpcPermissao(
    rpc,
    "usuarios.softDeleteUsuario/admins_ativos_count",
    {},
    "Não foi possível confirmar quantos administradores estão ativos. Operação bloqueada por segurança.",
  );
  if (count == null || Number(count) <= 1) {
    throw new Error("É necessário manter pelo menos um administrador ativo.");
  }
  return "removido";
}

describe("admins_ativos_count fail-closed", () => {
  it("bloqueia a remoção quando a RPC falha", async () => {
    await expect(protecaoUltimoAdmin({ data: null, error: { message: "timeout" } })).rejects.toThrow(
      /bloqueada por segurança/,
    );
  });
  it("bloqueia quando a contagem volta nula", async () => {
    await expect(protecaoUltimoAdmin({ data: null, error: null })).rejects.toThrow(
      /pelo menos um administrador ativo/,
    );
  });
  it("permite quando há mais de um admin", async () => {
    await expect(protecaoUltimoAdmin({ data: 3, error: null })).resolves.toBe("removido");
  });
});
