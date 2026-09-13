/**
 * Regressão: nenhuma etapa de lead pode ser gravada direto no `update`.
 *
 * O trigger `trg_leads_stage_lock` recusa UPDATE direto que tire o lead de
 * `ganho`/`perdido`. Devolução de pedido, reabertura de proposta e perda passam
 * pela função de banco `sistema_mover_etapa_lead` (via `moverStageLeadSistema`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("etapa de lead — caminho único", () => {
  it("nenhum arquivo grava leads.stage direto", () => {
    const suspeitos = arquivos("src").filter((p) => {
      if (p.endsWith("leads-stage.server.ts")) return false;
      const s = readFileSync(p, "utf8");
      return /from\("leads"\)\s*\n?\s*\.update\(\{[^}]{0,400}\bstage\s*:/s.test(s);
    });
    expect(suspeitos).toEqual([]);
  });

  it("devolução de pedido, reabertura de proposta e perda usam a função de sistema", () => {
    for (const p of [
      "src/lib/pedidos-devolucao.server.ts",
      "src/lib/propostas-perda.functions.ts",
      "src/lib/propostas-perda.server.ts",
      "src/lib/leads-perda.server.ts",
    ]) {
      expect(readFileSync(p, "utf8"), p).toContain("moverStageLeadSistema");
    }
  });

  it("a função de sistema chama a RPC própria, pelo client de serviço", () => {
    const s = readFileSync("src/lib/leads-stage.server.ts", "utf8");
    expect(s).toContain("supabaseAdmin.rpc(\"sistema_mover_etapa_lead\"");
  });
});
