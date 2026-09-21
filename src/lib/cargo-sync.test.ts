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

describe("a aplicação não grava o texto do cargo", () => {
  const fonte = readFileSync(join(RAIZ, "src/lib/usuarios.functions.ts"), "utf8");

  it("o patch de profiles usa cargo_id e não a coluna cargo", () => {
    expect(fonte).toContain("cargo_id: cargoId,");
    // nenhuma atribuição de objeto para a coluna de texto `cargo`
    expect(fonte).not.toMatch(/^\s*cargo:\s/m);
  });

  it("nenhum arquivo do app escreve profiles.cargo em update/insert", () => {
    const suspeitos: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) {
          const src = readFileSync(p, "utf8");
          if (/from\("profiles"\)/.test(src) && /^\s*cargo:\s/m.test(src)) suspeitos.push(p);
        }
      }
    };
    varrer(join(RAIZ, "src"));
    expect(suspeitos).toEqual([]);
  });
});
