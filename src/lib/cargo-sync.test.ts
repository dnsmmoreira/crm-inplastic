/**
 * Regressão da sincronização entre `profiles.cargo_id` (fonte da verdade) e o
 * texto `profiles.cargo` (derivado pelo trigger `profiles_cargo_texto`).
 *
 * Duas garantias:
 *  1. a APLICAÇÃO nunca grava o texto `cargo` em `profiles` (só `cargo_id`);
 *  2. o TRIGGER no banco deriva o texto de `cargos.nome` e, com `cargo_id`
 *     nulo, zera o texto — inclusive em INSERT e UPDATE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const MIGRACOES = join(RAIZ, "supabase/migrations");

function sqlDoTrigger(): string {
  const arquivos = readdirSync(MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const alvos = arquivos
    .map((f) => readFileSync(join(MIGRACOES, f), "utf8"))
    .filter((s) => s.includes("tg_profiles_cargo_texto"));
  expect(alvos.length).toBeGreaterThan(0);
  return alvos[alvos.length - 1];
}

describe("trigger profiles_cargo_texto", () => {
  const sql = sqlDoTrigger();

  it("deriva o texto de cargos.nome pelo cargo_id", () => {
    expect(sql).toMatch(/SELECT\s+c\.nome\s+INTO\s+NEW\.cargo\s+FROM\s+public\.cargos/i);
    expect(sql).toMatch(/WHERE\s+c\.id\s*=\s*NEW\.cargo_id/i);
  });

  it("zera o texto quando cargo_id é nulo", () => {
    expect(sql).toMatch(/IF\s+NEW\.cargo_id\s+IS\s+NULL\s+THEN[\s\S]*?NEW\.cargo\s*:=\s*NULL/i);
  });

  it("roda em INSERT e UPDATE, antes da gravação, linha a linha", () => {
    expect(sql).toMatch(/BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.profiles/i);
    expect(sql).toMatch(/FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+public\.tg_profiles_cargo_texto/i);
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public/i);
  });
});

describe("a aplicação não grava o texto do cargo ao salvar usuário", () => {
  const fonte = readFileSync(join(RAIZ, "src/lib/usuarios.functions.ts"), "utf8");
  const patch = fonte.slice(fonte.indexOf("const patch = {"), fonte.indexOf("audit.push("));

  it("o patch de profiles usa cargo_id e não a coluna de texto", () => {
    expect(patch).toContain("cargo_id: cargoId,");
    expect(patch).not.toMatch(/^\s*cargo:\s/m);
  });

  it("o texto do cargo só é lido do catálogo, para validação e auditoria", () => {
    expect(fonte).toContain("cargoTexto = cargoRow.nome;");
    expect(fonte).toMatch(/campo:\s*"cargo",\s*anterior:\s*profile\.cargo,\s*novo:\s*cargoTexto/);
  });

  it("a renomeação de cargo mantém o texto em sincronia pelo catálogo", () => {
    const cargos = readFileSync(join(RAIZ, "src/lib/cargos.functions.ts"), "utf8");
    expect(cargos).toMatch(
      /from\("profiles"\)\s*\.update\(\{\s*cargo:\s*data\.nome\s*\}\)\s*\.eq\("cargo_id",\s*data\.id\)/,
    );
  });
});
