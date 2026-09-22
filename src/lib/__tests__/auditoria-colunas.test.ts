import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda das colunas reais de `user_audit_log`:
 * alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo, criado_em.
 *
 * Gravar em `user_id` / `alterado_por` faz a inserção falhar em silêncio —
 * foi o que apagou a trilha de convites por semanas.
 */
const raiz = process.cwd();
const arquivos: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !/auditoria-colunas\.test\.ts$/.test(e.name)) {
      arquivos.push(p);
    }
  }
};
walk(join(raiz, "src"));

/** Só o objeto passado ao insert — nada do tratamento de erro logo abaixo. */
const blocosDeInsercao = (src: string): string[] => {
  const blocos: string[] = [];
  const marca = 'from("user_audit_log").insert(';
  let i = src.indexOf(marca);
  while (i >= 0) {
    const inicio = i + marca.length;
    const fim = src.indexOf("});", inicio);
    blocos.push(src.slice(inicio, fim > inicio ? fim : inicio + 300));
    i = src.indexOf(marca, i + 1);
  }
  return blocos;
};

describe("gravações em user_audit_log", () => {
  const comInsercao = arquivos
    .map((p) => ({ p, src: readFileSync(p, "utf8") }))
    .filter((f) => f.src.includes('from("user_audit_log").insert('));

  it("existem gravações para verificar", () => {
    expect(comInsercao.length).toBeGreaterThan(5);
  });

  it("nenhuma usa colunas inexistentes (user_id / alterado_por)", () => {
    const infratores = comInsercao.filter((f) =>
      blocosDeInsercao(f.src).some((b) => /\b(user_id|alterado_por)\s*:/.test(b)),
    );
    expect(infratores.map((f) => f.p)).toEqual([]);
  });

  it("nenhuma silencia o erro com console.error", () => {
    const infratores = comInsercao.filter((f) =>
      blocosDeInsercao(f.src).some((b) => /auditoria falhou/.test(b)),
    );
    expect(infratores.map((f) => f.p)).toEqual([]);
  });

  it("todo arquivo que grava auditoria trata a falha com registrarFalhaSegura", () => {
    const semTratamento = comInsercao
      .filter((f) => !/registrarFalhaSegura|assertNoError/.test(f.src))
      .map((f) => f.p);
    expect(semTratamento).toEqual([]);
  });

  it("a busca do usuário por e-mail usa email_cache (profiles não tem coluna email)", () => {
    const src = readFileSync(join(raiz, "src/lib/invites.functions.ts"), "utf8");
    expect(src).toContain('.ilike("email_cache"');
    expect(src).not.toContain('.ilike("email"');
  });
});
