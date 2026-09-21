/**
 * Teste de integração (banco real, somente leitura) do bucket `whatsapp-anexos`.
 *
 * Garante que as policies abertas ("qualquer usuário logado") sumiram e que
 * leitura e envio passaram a depender da conversa do caminho do arquivo.
 * Mesma convenção dos demais testes de banco: em CI nunca é pulado em silêncio.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const VARIAVEIS = ["PGHOST", "PGUSER", "PGDATABASE"] as const;
const OBRIGATORIO =
  process.env["CI"] === "true" || process.env["CARGO_DB_OBRIGATORIO"] === "1";

function consulta(sql: string): string {
  return execFileSync("psql", ["-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const ausentes = VARIAVEIS.filter((v) => !process.env[v]);
let conexaoOk = false;
let erroConexao = "variáveis ausentes";
if (ausentes.length === 0) {
  try {
    conexaoOk = consulta("SELECT 1") === "1";
  } catch (e) {
    erroConexao = e instanceof Error ? e.message : String(e);
  }
}
const TEM_BANCO = ausentes.length === 0 && conexaoOk;

describe("pré-requisito: acesso ao banco", () => {
  it("em CI, as variáveis PG* estão definidas", () => {
    if (!OBRIGATORIO) return expect(true).toBe(true);
    expect(ausentes, `Defina ${VARIAVEIS.join(", ")} no pipeline.`).toEqual([]);
  });
  it("em CI, a conexão responde", () => {
    if (!OBRIGATORIO) return expect(true).toBe(true);
    expect(conexaoOk, `Banco inacessível em CI: ${erroConexao}`).toBe(true);
  });
});

const POLICIES = `SELECT replace(policyname || '|' || cmd || '|' || coalesce(qual,'') || coalesce(with_check,''), chr(10), ' ')
  FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%whatsapp-anexos%'`;

describe.skipIf(!TEM_BANCO)("banco: RLS do bucket whatsapp-anexos", () => {
  it("as policies abertas foram removidas", () => {
    const abertas = consulta(
      `SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
         AND policyname IN ('whatsapp anexos leitura autenticada','whatsapp anexos upload autenticado')`,
    );
    expect(abertas).toBe("0");
  });

  it("existem exatamente duas policies no bucket: uma de SELECT e uma de INSERT", () => {
    const linhas = consulta(POLICIES).split("\n").filter(Boolean);
    expect(linhas).toHaveLength(2);
    const cmds = linhas.map((l) => l.split("|")[1]).sort();
    expect(cmds).toEqual(["INSERT", "SELECT"]);
  });

  it("não há policy de UPDATE nem de DELETE no bucket", () => {
    const linhas = consulta(POLICIES).split("\n").filter(Boolean);
    const cmds = linhas.map((l) => l.split("|")[1]);
    expect(cmds).not.toContain("UPDATE");
    expect(cmds).not.toContain("DELETE");
  });

  it("a leitura usa a função indexada whatsapp_anexo_visivel (sem varrer conversas)", () => {
    const qual = consulta(
      `SELECT qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
         AND policyname = 'whatsapp anexos leitura por conversa'`,
    );
    expect(qual).toContain("whatsapp_anexo_visivel");
    expect(qual).not.toContain("EXISTS");
    expect(qual).not.toContain("split_part");
  });

  it("whatsapp_anexo_visivel é STABLE SECURITY DEFINER com search_path fixo", () => {
    const meta = consulta(
      `SELECT p.provolatile::text || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig,','),'')
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='whatsapp_anexo_visivel'`,
    );
    expect(meta.split("|")[0]).toBe("s");
    expect(meta.split("|")[1]).toBe("true");
    expect(meta).toContain("search_path=public");
  });

  it("whatsapp_anexo_visivel só pode ser executada por usuários autenticados", () => {
    const anon = consulta(
      `SELECT has_function_privilege('anon','public.whatsapp_anexo_visivel(text)','EXECUTE')`,
    );
    const auth = consulta(
      `SELECT has_function_privilege('authenticated','public.whatsapp_anexo_visivel(text)','EXECUTE')`,
    );
    expect(anon).toBe("f");
    expect(auth).toBe("t");
  });

  it("a função localiza uma única conversa e repete as 3 regras de SELECT da conversa", () => {
    const corpo = consulta(
      `SELECT replace(prosrc, chr(10), ' ') FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='whatsapp_anexo_visivel'`,
    );
    expect(corpo).toContain("c.id = _seg::uuid");
    expect(corpo).toContain("c.phone = split_part(_name, '/', 2)");
    expect(corpo).toContain("has_role(auth.uid(), 'admin'");
    expect(corpo).toContain("atribuido_para = auth.uid()");
    expect(corpo).toContain("_owner = auth.uid()");
    expect(corpo).toContain("whatsapp_conversa_visivel(");
    expect(corpo).toContain("whatsapp_conversa_visivel_auditor(");
  });

  it("whatsapp_conversas tem índice por telefone", () => {
    const idx = consulta(
      `SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND tablename='whatsapp_conversas' AND indexdef LIKE '%(phone)%'`,
    );
    expect(Number(idx)).toBeGreaterThan(0);
  });


  it("o envio exige poder atuar na conversa, com caminho em formato de id", () => {
    const check = consulta(
      `SELECT with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
         AND policyname = 'whatsapp anexos upload por conversa'`,
    );
    expect(check).toContain("whatsapp_pode_atuar");
    expect(check).toMatch(/~~?\*?/);
  });

  it("as duas policies valem só para usuários autenticados", () => {
    const papeis = consulta(
      `SELECT DISTINCT unnest(roles) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
         AND policyname LIKE 'whatsapp anexos%'`,
    );
    expect(papeis).toBe("authenticated");
  });
});
