/**
 * Teste de integração (banco real, somente leitura) da sincronização entre
 * `profiles.cargo_id` e o texto derivado `profiles.cargo`.
 *
 * Roda apenas quando o ambiente tem acesso ao banco (variáveis PG*). Sem
 * acesso, os casos são pulados em vez de falhar.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const TEM_BANCO = Boolean(process.env["PGHOST"]);

function consulta(sql: string): string {
  return execFileSync("psql", ["-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe.skipIf(!TEM_BANCO)("banco: derivação de profiles.cargo", () => {
  it("o trigger existe em profiles, antes de INSERT e UPDATE, linha a linha", () => {
    const linha = consulta(`
      SELECT (t.tgtype & 2) > 0 AS antes,
             (t.tgtype & 1) > 0 AS por_linha,
             (t.tgtype & 4) > 0 AS insert,
             (t.tgtype & 16) > 0 AS update
      FROM pg_trigger t
      WHERE t.tgrelid = 'public.profiles'::regclass
        AND t.tgname = 'profiles_cargo_texto'
        AND NOT t.tgisinternal`);
    expect(linha).toBe("t|t|t|t");
  });

  it("a função é SECURITY DEFINER, com search_path fixo, e zera o texto quando o cargo é nulo", () => {
    const def = consulta(
      `SELECT pg_get_functiondef(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'tg_profiles_cargo_texto'`,
    );
    expect(def).toMatch(/SECURITY DEFINER/i);
    expect(def).toMatch(/SET search_path TO 'public'/i);
    expect(def).toMatch(/IF NEW\.cargo_id IS NULL THEN[\s\S]*?NEW\.cargo\s*:=\s*NULL/i);
    expect(def).toMatch(/FROM\s+public\.cargos/i);
    expect(def).toMatch(/WHERE\s+c\.id\s*=\s*NEW\.cargo_id/i);
  });

  it("nenhuma pessoa tem texto de cargo sem cargo do catálogo", () => {
    const n = consulta(
      "SELECT count(*) FROM public.profiles WHERE cargo_id IS NULL AND cargo IS NOT NULL",
    );
    expect(n).toBe("0");
  });

  it("todo texto de cargo gravado é igual ao nome do cargo do catálogo", () => {
    const n = consulta(`
      SELECT count(*) FROM public.profiles p
      JOIN public.cargos c ON c.id = p.cargo_id
      WHERE p.cargo IS DISTINCT FROM c.nome`);
    expect(n).toBe("0");
  });
});
