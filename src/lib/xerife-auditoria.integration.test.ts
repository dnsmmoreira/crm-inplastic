/**
 * Teste de integração (banco real, somente leitura) do Xerife Humano.
 *
 * Confere que as permissões de leitura por equipe existem, que as policies
 * novas são ADITIVAS e só de SELECT, e que as tabelas de avaliação estão
 * protegidas por RLS. Mesma convenção de `cargo-sync.integration.test.ts`:
 * em CI nunca é pulado em silêncio.
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

const CHAVES = [
  "tarefas.ver_equipe",
  "interacoes.ver_equipe",
  "whatsapp.ver_equipe",
  "xerife.ver_equipe",
  "xerife.avaliar",
];

describe.skipIf(!TEM_BANCO)("banco: Xerife Humano", () => {
  it.each(CHAVES)("a permissão %s existe no catálogo", (chave) => {
    expect(consulta(`SELECT count(*) FROM public.permissoes WHERE chave = '${chave}'`)).toBe("1");
  });

  it.each([
    ["tarefas", "tarefas select ver_equipe"],
    ["lead_interactions", "interactions select ver_equipe"],
    ["whatsapp_conversas", "conversas select auditor equipe"],
    ["whatsapp_mensagens", "mensagens select auditor equipe"],
    ["xerife_log", "xerife_log select ver_equipe"],
  ])("a policy de leitura %s/%s é aditiva e só de SELECT", (tabela, policy) => {
    expect(
      consulta(
        `SELECT cmd || '|' || permissive FROM pg_policies
         WHERE tablename = '${tabela}' AND policyname = '${policy}'`,
      ),
    ).toBe("SELECT|PERMISSIVE");
  });

  it("as policies de leitura exigem permissão E equipe", () => {
    const q = consulta(
      `SELECT string_agg(policyname, ',') FROM pg_policies
       WHERE policyname IN ('tarefas select ver_equipe','interactions select ver_equipe',
                            'xerife_log select ver_equipe')
         AND qual LIKE '%tem_permissao%' AND qual LIKE '%mesma_equipe%'`,
    );
    expect(q.split(",").sort()).toEqual([
      "interactions select ver_equipe",
      "tarefas select ver_equipe",
      "xerife_log select ver_equipe",
    ]);
  });

  it.each(["xerife_avaliacoes", "xerife_deixou_passar"])(
    "a tabela %s existe com RLS ligada e policies",
    (tabela) => {
      expect(
        consulta(
          `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${tabela}'::regclass`,
        ),
      ).toBe("t");
      expect(
        Number(consulta(`SELECT count(*) FROM pg_policies WHERE tablename = '${tabela}'`)),
      ).toBeGreaterThan(0);
    },
  );

  it("o perfil Auditor Xerife nunca é administrador", () => {
    expect(
      consulta(`SELECT base_role FROM public.perfis WHERE nome = 'Auditor Xerife'`),
    ).not.toBe("admin");
  });

  it("o perfil Auditor Xerife não recebe whatsapp.atender", () => {
    expect(
      consulta(
        `SELECT count(*) FROM public.perfil_permissoes pp
         JOIN public.perfis p ON p.id = pp.perfil_id
         WHERE p.nome = 'Auditor Xerife' AND pp.permissao_chave = 'whatsapp.atender'`,
      ),
    ).toBe("0");
  });

  it("o Supervisor ADM ganhou leitura de tarefas, interações e WhatsApp, sem Xerife", () => {
    const chaves = consulta(
      `SELECT string_agg(pp.permissao_chave, ',' ORDER BY pp.permissao_chave)
       FROM public.perfil_permissoes pp JOIN public.perfis p ON p.id = pp.perfil_id
       WHERE p.nome = 'Supervisor ADM'`,
    ).split(",");
    expect(chaves).toContain("tarefas.ver_equipe");
    expect(chaves).toContain("interacoes.ver_equipe");
    expect(chaves).toContain("whatsapp.ver_equipe");
    expect(chaves.filter((c) => c.startsWith("xerife."))).toEqual([]);
  });
});

describe.skipIf(!TEM_BANCO)("banco: lista de colegas da equipe", () => {
  it("a função equipe_listar_colegas é SECURITY DEFINER e executável só por authenticated", () => {
    expect(
      consulta(
        `SELECT prosecdef::text FROM pg_proc WHERE proname = 'equipe_listar_colegas'`,
      ),
    ).toBe("true");
    const acl = consulta(
      `SELECT proacl::text FROM pg_proc WHERE proname = 'equipe_listar_colegas'`,
    );
    expect(acl).toContain("authenticated=X");
    expect(acl).not.toMatch(/\banon=X/);
    expect(acl).not.toMatch(/^\{=X/);
  });

  it("filtra por equipe: só perfis ativos que passam em supervisor_ve_tudo OU mesma_equipe", () => {
    const def = consulta(
      `SELECT prosrc FROM pg_proc WHERE proname = 'equipe_listar_colegas'`,
    );
    expect(def).toMatch(/supervisor_ve_tudo\(auth\.uid\(\)\)/);
    expect(def).toMatch(/mesma_equipe\(auth\.uid\(\), p\.id\)/);
    expect(def).toMatch(/p\.ativo = true/);
    expect(def).toMatch(/p\.deleted_at IS NULL/);
  });

  it("a policy de SELECT de profiles continua fechada (só o próprio perfil ou admin)", () => {
    const quals = consulta(
      `SELECT string_agg(qual, ' ;; ') FROM pg_policies
       WHERE tablename = 'profiles' AND cmd = 'SELECT'`,
    );
    expect(quals).not.toContain("mesma_equipe");
    expect(quals).toContain("auth.uid() = id");
  });

  it("para a auditora da Maxicaixa a lista traz só a própria equipe", () => {
    const nomes = consulta(
      `SELECT string_agg(p.name, ',' ORDER BY p.name) FROM public.profiles p
       WHERE p.ativo = true AND p.deleted_at IS NULL
         AND p.equipe_id = (SELECT equipe_id FROM public.profiles
                            WHERE id = 'd714421e-49e1-42c3-874c-bcb9681407e3')`,
    ).split(",");
    for (const esperado of [
      "Lais",
      "Kelly Maxicaixa",
      "Carol Maxicaixa",
      "Bertuolo Maxicaixa",
      "Luciano Maxicaixa",
    ]) {
      expect(nomes).toContain(esperado);
    }
    expect(nomes).not.toContain("Denis");
    expect(nomes).not.toContain("PAMELA");
    expect(nomes).not.toContain("BEATRIZ");
  });
});
