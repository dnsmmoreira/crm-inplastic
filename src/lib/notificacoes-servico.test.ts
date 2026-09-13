/**
 * Regressão: aviso para OUTRA pessoa precisa ser gravado pelo client de
 * serviço — `notificacoes` não tem policy de INSERT, então o client do usuário
 * é recusado pelo RLS e o aviso simplesmente não chegava.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const admin = { marca: "admin" as const };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
const registrarFalhaAdmin = vi.fn(async () => true);
vi.mock("@/lib/falhas.server", () => ({
  registrarFalhaAdmin: (...a: unknown[]) => registrarFalhaAdmin(...(a as [])),
}));

import { notificarUsuarios } from "@/lib/pedidos-fluxo.server";

type Insercao = { sb: unknown; linhas: unknown[] };

function sbFake(marca: string, registro: Insercao[], error: unknown = null) {
  const sb: Record<string, unknown> = {
    marca,
    from(tabela: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        is: () => api,
        insert: async (linhas: unknown[]) => {
          registro.push({ sb: marca, linhas });
          return { error };
        },
        then: (res: (v: unknown) => unknown) =>
          res({ data: tabela === "profiles" ? [] : [] }),
      };
      return api;
    },
  };
  return sb;
}

describe("notificarUsuarios", () => {
  beforeEach(() => registrarFalhaAdmin.mockClear());

  it("grava pelo client de serviço mesmo recebendo o client do usuário", async () => {
    const reg: Insercao[] = [];
    // O admin mockado não tem `.from`: damos um para ele.
    Object.assign(admin, sbFake("admin", reg));
    const n = await notificarUsuarios(sbFake("usuario", reg), ["u1"], {
      tipo: "pedido_prazo_alterado",
      titulo: "Prazo alterado",
      pedidoId: "p1",
    });
    expect(n).toBe(1);
    expect(reg.at(-1)?.sb).toBe("admin");
  });

  it("respeita o chamador que já entregou um client capaz de gravar", async () => {
    const reg: Insercao[] = [];
    Object.assign(admin, sbFake("admin", reg));
    await notificarUsuarios(sbFake("proprio", reg), ["u1"], {
      tipo: "pedido_parado",
      titulo: "Pedido parado",
      pedidoId: "p2",
      usarClienteDeServico: false,
    });
    expect(reg.at(-1)?.sb).toBe("proprio");
  });

  it("recusa do banco vira falha registrada com contexto e zero avisos", async () => {
    const reg: Insercao[] = [];
    Object.assign(
      admin,
      sbFake("admin", reg, { code: "42501", message: "row-level security" }),
    );
    const n = await notificarUsuarios(sbFake("usuario", reg), ["u1"], {
      tipo: "pedido_devolvido",
      titulo: "Pedido devolvido",
      pedidoId: "p3",
      propostaId: "prop3",
    });
    expect(n).toBe(0);
    const [origem, , ctx] = registrarFalhaAdmin.mock.calls[0] as [string, unknown, any];
    expect(origem).toBe("rls.notificacoes");
    expect(ctx).toMatchObject({ pedido_id: "p3", proposta_id: "prop3", tipo: "pedido_devolvido" });
  });
});
