/**
 * Regressão: recusa do banco em `notificacoes`/`user_audit_log` não pode
 * sumir em silêncio — precisa virar falha registrada COM contexto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ehErroDePermissao, origemDaFalha, inserirMonitorado } from "@/lib/rls-monitor.server";

const registrarFalhaAdmin = vi.fn(async () => true);
vi.mock("@/lib/falhas.server", () => ({
  registrarFalhaAdmin: (...a: unknown[]) => registrarFalhaAdmin(...(a as [])),
}));

function sbFake(error: unknown) {
  const inseridas: unknown[] = [];
  return {
    inseridas,
    from() {
      return {
        insert: async (linhas: unknown) => {
          inseridas.push(linhas);
          return { error };
        },
      };
    },
  };
}

describe("rls-monitor", () => {
  beforeEach(() => registrarFalhaAdmin.mockClear());

  it("reconhece recusa de RLS por código e por mensagem", () => {
    expect(ehErroDePermissao({ code: "42501" })).toBe(true);
    expect(
      ehErroDePermissao({ message: 'new row violates row-level security policy for table "x"' }),
    ).toBe(true);
    expect(ehErroDePermissao({ message: "duplicate key value" })).toBe(false);
  });

  it("separa origem de permissão e de erro comum", () => {
    expect(origemDaFalha("notificacoes", { code: "42501" })).toBe("rls.notificacoes");
    expect(origemDaFalha("user_audit_log", { message: "boom" })).toBe("insert.user_audit_log");
  });

  it("grava sem registrar falha no caminho feliz", async () => {
    const sb = sbFake(null);
    const r = await inserirMonitorado(sb, "notificacoes", { user_id: "u1" });
    expect(r.ok).toBe(true);
    expect(registrarFalhaAdmin).not.toHaveBeenCalled();
  });

  it("registra falha de RLS com o contexto da ação", async () => {
    const sb = sbFake({ code: "42501", message: "new row violates row-level security policy" });
    const r = await inserirMonitorado(
      sb,
      "notificacoes",
      [{ user_id: "u1" }, { user_id: "u2" }],
      { pedido_id: "p1", tipo: "pedido_prazo_alterado" },
    );
    expect(r.ok).toBe(false);
    const [origem, , ctx] = registrarFalhaAdmin.mock.calls[0] as unknown as [string, unknown, any];
    expect(origem).toBe("rls.notificacoes");
    expect(ctx).toMatchObject({
      tabela: "notificacoes",
      linhas: 2,
      permissao_negada: true,
      pedido_id: "p1",
      tipo: "pedido_prazo_alterado",
    });
  });

  it("não lança quando o próprio insert explode", async () => {
    const sb = {
      from() {
        return {
          insert: async () => {
            throw new Error("sem rede");
          },
        };
      },
    };
    const r = await inserirMonitorado(sb, "user_audit_log", { campo: "x" }, { ator: "u1" });
    expect(r.ok).toBe(false);
    expect(registrarFalhaAdmin).toHaveBeenCalledTimes(1);
  });

  it("lista vazia não toca no banco", async () => {
    const sb = sbFake({ code: "42501" });
    const r = await inserirMonitorado(sb, "notificacoes", []);
    expect(r.ok).toBe(true);
    expect(sb.inseridas).toHaveLength(0);
  });
});
