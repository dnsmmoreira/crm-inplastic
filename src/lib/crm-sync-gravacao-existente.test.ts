/**
 * Trava do incidente 22/09 (lead "ELO SOLUCAO" do Daniel).
 *
 * O payload de registro JÁ EXISTENTE não leva `owner_id` de propósito. Num
 * `upsert` (INSERT ... ON CONFLICT DO UPDATE) o Postgres aplica o WITH CHECK da
 * policy de INSERT à linha proposta e recusa com 42501 — o vendedor não
 * conseguia salvar o PRÓPRIO lead. Registro existente tem que ir por UPDATE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync("src/lib/crm-sync.ts", "utf8");

function blocoDaColecao(tabela: string): string {
  const i = fonte.indexOf(`collectionName: "${tabela}"`);
  expect(i, `coleção ${tabela} não encontrada`).toBeGreaterThan(-1);
  const inicio = fonte.lastIndexOf("await syncCollection", i);
  return fonte.slice(inicio, i);
}

describe("gravação de registro existente no motor de sync", () => {
  for (const colecao of ["leads", "tasks", "proposals"]) {
    it(`${colecao}: separa novo (insert) de existente (update), sem upsert cego`, () => {
      const bloco = blocoDaColecao(colecao);
      expect(bloco).toContain("gravarNovosEExistentes");
      expect(bloco).toContain(".update(");
      expect(bloco).toContain('.eq("id", id)');
      expect(bloco).not.toContain("onConflict");
    });
  }

  it("persistLeadNow também não faz upsert de lead existente", () => {
    const i = fonte.indexOf("export async function persistLeadNow(");
    const corpo = fonte.slice(i, fonte.indexOf("\n}", i));
    expect(corpo).toContain("snapshot.leads.has(lead.id)");
    expect(corpo).toContain(".update(");
    expect(corpo).not.toContain("onConflict");
  });

  it("a falha de gravação leva os ids, para o diagnóstico do dono real", () => {
    expect(fonte).toContain("ids: toUpsert.map((item) => toKey(item))");
  });
});

describe("mensagem de lead recusado", () => {
  const falhas = readFileSync("src/lib/sync-falhas.ts", "utf8");

  it("só acusa 'outro vendedor' depois de confirmar o dono no servidor", () => {
    expect(falhas).toContain('motivoFalhaLead(erro) === "sem_permissao"');
    expect(falhas).toContain("avisarLeadRecusado");
    expect(falhas).toContain("MSG_LEAD_RECUSADO_GENERICO");
  });

  it("a recusa é registrada em /falhas pelo servidor", () => {
    const diag = readFileSync("src/lib/lead-diagnostico.functions.ts", "utf8");
    expect(diag).toContain("registrarFalhaAdmin");
    expect(diag).toContain("crm-sync.leads/recusado");
    // nunca devolve nome/dados do dono — só o sinalizador
    expect(diag).toContain("dono_outro");
    expect(diag).not.toContain("resolveNames");
  });
});
