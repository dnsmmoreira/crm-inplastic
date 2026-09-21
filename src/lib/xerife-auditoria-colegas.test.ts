/**
 * Nomes e lista de vendedores da Auditoria do Xerife.
 *
 * A policy de SELECT de `profiles` continua fechada (um não-admin só lê o
 * próprio perfil), então a tela precisa resolver nomes pela RPC SECURITY
 * DEFINER `equipe_listar_colegas`. Este teste trava isso: nada de
 * `from("profiles")` no módulo, e a lista de vendedores sai da RPC (todos os
 * ativos da equipe, inclusive quem nunca foi cobrado pelo Xerife).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ARQUIVO = "src/lib/xerife-auditoria.functions.ts";
const src = readFileSync(ARQUIVO, "utf8");

describe("auditoria do Xerife: nomes da equipe", () => {
  it("não lê a tabela de perfis diretamente", () => {
    expect(src).not.toMatch(/from\(\s*["']profiles["']\s*\)/);
  });

  it("usa a RPC equipe_listar_colegas", () => {
    expect(src).toMatch(/rpc\(\s*["']equipe_listar_colegas["']\s*\)/);
  });

  it("as ações e as opções passam pelo mesmo resolvedor", () => {
    const usos = src.match(/colegasDaEquipe\(supabase\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
  });

  it("a lista de vendedores não é mais derivada de xerife_log", () => {
    const i = src.indexOf("export const opcoesAuditoriaXerife");
    const trecho = src.slice(i, src.indexOf("\nexport const ", i + 10));
    expect(trecho).not.toMatch(/vendedor_id\)\.filter\(Boolean\)/);
  });
});
