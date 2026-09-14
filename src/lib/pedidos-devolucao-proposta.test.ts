/**
 * Regressão do incidente PED-2026-0091 / PED-2026-0081:
 * a devolução feita por um OPERACIONAL (sem `propostas.editar`, não dono, não
 * admin) precisa reabrir a proposta igual à devolução feita pelo dono/admin.
 * O RLS recusava em silêncio (0 linhas, sem `error`) quando o UPDATE usava o
 * client do caller.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const registrarFalhaAdmin = vi.fn(async () => true);
vi.mock("@/lib/falhas.server", () => ({ registrarFalhaAdmin }));

type Linha = { id: string; status: string };

/**
 * Client fake de `propostas` com RLS opcional: quando `podeEditar` é false o
 * UPDATE não afeta linha nenhuma e NÃO devolve `error` (comportamento real do
 * Postgres com row level security).
 */
function criarSbPropostas(opts: { podeEditar: boolean; linha: Linha }) {
  const estado = { ...opts.linha };
  const from = (_t: string) => {
    let op: "select" | "update" = "select";
    let patch: Record<string, unknown> = {};
    let filtroStatus: string | null = null;
    const b: Record<string, unknown> = {};
    b['update'] = (v: Record<string, unknown>) => {
      op = "update";
      patch = v;
      return b;
    };
    b['select'] = (..._a: unknown[]) => b;
    b['eq'] = (col: string, val: string) => {
      if (col === "status") filtroStatus = val;
      return b;
    };
    b['maybeSingle'] = () => Promise.resolve({ data: { status: estado.status }, error: null });
    b['then'] = (res: (v: unknown) => unknown) => {
      if (op === "update") {
        const casa = filtroStatus === null || filtroStatus === estado.status;
        if (casa && opts.podeEditar) {
          Object.assign(estado, patch);
          return Promise.resolve({ data: [{ id: estado.id }], error: null }).then(res);
        }
        // RLS recusa em silêncio: zero linhas, sem erro.
        return Promise.resolve({ data: [], error: null }).then(res);
      }
      return Promise.resolve({ data: { status: estado.status }, error: null }).then(res);
    };
    return b;
  };
  return { sb: { from } as never, estado };
}

beforeEach(() => registrarFalhaAdmin.mockClear());

describe("reabertura da proposta na devolução", () => {
  it("reabre quando o client tem permissão (dono/admin/serviço)", async () => {
    const { reabrirPropostaDevolucao } = await import("./pedidos-devolucao.server");
    const { sb, estado } = criarSbPropostas({
      podeEditar: true,
      linha: { id: "p1", status: "pedido" },
    });
    await reabrirPropostaDevolucao(sb, { propostaId: "p1", pedidoId: "ped1" });
    expect(estado.status).toBe("rascunho");
  });

  it("falha (não segue em silêncio) quando o RLS recusa sem erro — caso do operacional", async () => {
    const { reabrirPropostaDevolucao } = await import("./pedidos-devolucao.server");
    const { sb, estado } = criarSbPropostas({
      podeEditar: false,
      linha: { id: "p1", status: "pedido" },
    });
    await expect(
      reabrirPropostaDevolucao(sb, { propostaId: "p1", pedidoId: "ped1" }),
    ).rejects.toThrow(/reabrir a proposta/i);
    expect(estado.status).toBe("pedido");
    expect(registrarFalhaAdmin).toHaveBeenCalled();
  });

  it("é idempotente: proposta já em rascunho não vira falha", async () => {
    const { reabrirPropostaDevolucao } = await import("./pedidos-devolucao.server");
    const { sb } = criarSbPropostas({
      podeEditar: true,
      linha: { id: "p1", status: "rascunho" },
    });
    await expect(
      reabrirPropostaDevolucao(sb, { propostaId: "p1", pedidoId: "ped1" }),
    ).resolves.toBeUndefined();
    expect(registrarFalhaAdmin).not.toHaveBeenCalled();
  });

  it("o núcleo da devolução usa o client de serviço para reabrir a proposta", () => {
    const src = readFileSync("src/lib/pedidos-devolucao.server.ts", "utf8");
    // Nunca com o client do caller (`sb`) — mesmo raciocínio já aplicado ao lead.
    expect(src).not.toMatch(/await sb\s*\n?\s*\.from\("propostas"\)\s*\n?\s*\.update/);
    expect(src).toContain("reabrirPropostaDevolucao(sbAdminProp");
    expect(src).toContain('.select("id")');
  });
});
