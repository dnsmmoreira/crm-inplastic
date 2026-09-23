/**
 * Lote 6 — trilha do estoque, limite da porta de entrada e máscara de meta no MCP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { montarLinhasPlacar, type LinhaPlacar } from "@/lib/mcp/tools/placar_atual";

// ---- estado compartilhado dos fakes -------------------------------------
const estado = {
  isAdmin: true as boolean | null,
  adminError: null as unknown,
  produto: { sku: "SKU-1", name: "Caixa", estoque_atual: 40 } as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  limitePermitido: true,
};

function clienteUsuario() {
  return {
    rpc: async (_nome: string) => ({ data: estado.isAdmin, error: estado.adminError }),
    from: (_tabela: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: estado.produto, error: null }) }),
      }),
      update: (valores: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          estado.updates.push({ id, ...valores });
          return { error: null };
        },
      }),
    }),
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

vi.mock("@/lib/rls-monitor.server", () => ({
  inserirMonitorado: async (
    _sb: unknown,
    tabela: string,
    linhas: Record<string, unknown>,
  ) => {
    estado.auditoria.push({ tabela, ...linhas });
    return { ok: true, error: null };
  },
}));

vi.mock("@/lib/rate-limit.server", () => ({
  consumirTentativa: async () => ({
    permitido: estado.limitePermitido,
    usadas: estado.limitePermitido ? 1 : 31,
  }),
}));

vi.mock("@/lib/falhas.server", () => ({ registrarFalhaAdmin: async () => undefined }));

const { ajustarSaldoCore } = await import("@/lib/estoque.functions");
const { assertLimiteContatoEntrada } = await import("@/lib/contato-entrada.functions");

beforeEach(() => {
  estado.isAdmin = true;
  estado.adminError = null;
  estado.produto = { sku: "SKU-1", name: "Caixa", estoque_atual: 40 };
  estado.updates = [];
  estado.auditoria = [];
  estado.limitePermitido = true;
});

describe("ajuste manual de estoque", () => {
  it("recusa quem não é admin e não escreve nada", async () => {
    estado.isAdmin = false;
    await expect(
      ajustarSaldoCore(clienteUsuario(), "u-1", {
        produtoId: "11111111-1111-4111-8111-111111111111",
        saldo: 5,
      }),
    ).rejects.toThrow(/permissão para ajustar o estoque/i);
    expect(estado.updates).toHaveLength(0);
    expect(estado.auditoria).toHaveLength(0);
  });

  it("admin atualiza o saldo e deixa a linha de auditoria", async () => {
    const r = await ajustarSaldoCore(clienteUsuario(), "u-1", {
      produtoId: "11111111-1111-4111-8111-111111111111",
      saldo: 120,
    });
    expect(r).toMatchObject({ ok: true, saldo: 120 });
    expect(estado.updates).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", estoque_atual: 120 },
    ]);
    expect(estado.auditoria[0]).toMatchObject({
      tabela: "user_audit_log",
      ator_user_id: "u-1",
      alvo_user_id: "u-1",
      campo: "estoque_produto",
      valor_anterior: "40",
      valor_novo: "SKU-1: 40 → 120",
    });
  });
});

describe("limite da verificação de contato", () => {
  it("lança quando o limite estoura e nunca devolve 'livre'", async () => {
    estado.limitePermitido = false;
    await expect(assertLimiteContatoEntrada("u-1")).rejects.toThrow(/Muitas verificações/i);
    estado.limitePermitido = true;
    await expect(assertLimiteContatoEntrada("u-1")).resolves.toBeUndefined();
  });
});

describe("máscara de meta no placar do MCP", () => {
  const rows: LinhaPlacar[] = [
    {
      vendedor_id: "eu",
      nome: "EU",
      posicao: 1,
      score: 10,
      ganhos_qtd: 2,
      ganhos_valor: 1000,
      propostas_qtd: 3,
      conversao: 50,
      slas_estourados: 0,
      meta_valor: 5000,
      meta_pct: 20,
    },
    {
      vendedor_id: "outro",
      nome: "OUTRO",
      posicao: 2,
      score: 8,
      ganhos_qtd: 1,
      ganhos_valor: 500,
      propostas_qtd: 2,
      conversao: 40,
      slas_estourados: 1,
      meta_valor: 9000,
      meta_pct: 5,
    },
  ];

  it("não-admin vê a própria meta e não vê a dos outros", () => {
    const { ranking, linhas } = montarLinhasPlacar(rows, "eu", false);
    expect(ranking[0]).toMatchObject({ meta_valor: 5000, meta_pct: 20 });
    expect(ranking[1]).toMatchObject({ meta_valor: null, meta_pct: null });
    expect(linhas[0]).toContain("meta 20%");
    expect(linhas[1]).not.toContain("meta");
  });

  it("admin vê a meta de todos", () => {
    const { ranking } = montarLinhasPlacar(rows, "eu", true);
    expect(ranking[1]).toMatchObject({ meta_valor: 9000, meta_pct: 5 });
  });

  it("chamador desconhecido não vê meta nenhuma", () => {
    const { ranking } = montarLinhasPlacar(rows, null, false);
    expect(ranking.every((r) => r.meta_valor === null && r.meta_pct === null)).toBe(true);
  });
});
