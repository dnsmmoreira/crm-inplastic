/**
 * Testes estruturais do P0 de segurança:
 *  • nenhum hook público aceita apikey / force / dryRun;
 *  • toda server function usa o middleware com checagem de conta ativa;
 *  • não existe mais endpoint público de primeiro acesso;
 *  • o SQL preparado nunca deriva papel de raw_user_meta_data.role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HOOKS = join(process.cwd(), "src/routes/api/public/hooks");
const ALVOS = [
  "xerife.ts",
  "xerife-engine.ts",
  "xerife-checkpoint.ts",
  "xerife-fechamento.ts",
  "xerife-agenda-diaria.ts",
  "xerife-pedidos.ts",
  "xerife-watchdog-conversa.ts",
  "ia-fila-envio.ts",
];

describe("hooks de cron", () => {
  for (const f of ALVOS) {
    const src = readFileSync(join(HOOKS, f), "utf8");
    const handler = src.slice(src.indexOf("POST: async"));

    it(`${f} usa requireXerifeCronAuth antes de tudo`, () => {
      expect(handler).toContain("const denied = await requireXerifeCronAuth(request);");
      const idxAuth = handler.indexOf("requireXerifeCronAuth");
      const idxRun = handler.indexOf("try {");
      expect(idxAuth).toBeLessThan(idxRun);
    });

    it(`${f} não aceita apikey/publishable key`, () => {
      expect(handler).not.toContain("apikey");
      expect(handler).not.toContain("SUPABASE_PUBLISHABLE_KEY");
    });

    it(`${f} não lê force/dryRun da query string`, () => {
      expect(handler).not.toMatch(/searchParams\.get\("(force|dryRun|dry)"\)/);
    });

    it(`${f} não vaza mensagem interna no erro 500`, () => {
      expect(handler).not.toContain("e instanceof Error ? e.message");
    });
  }
});

describe("middleware de conta ativa", () => {
  const dirs = ["src/lib", "src/routes"];
  const arquivos: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) arquivos.push(p);
    }
  };
  dirs.forEach((d) => walk(join(process.cwd(), d)));

  it("nenhuma server function importa o middleware gerado direto", () => {
    const infratores = arquivos
      .filter((p) => !/auth\.middleware\.ts$|seguranca-p0\.test\.ts$/.test(p))
      .filter((p) =>
        readFileSync(p, "utf8").includes('from "@/integrations/supabase/auth-middleware"'),
      );
    expect(infratores).toEqual([]);
  });

  it("o middleware da aplicação bloqueia inativo/excluído", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/auth.middleware.ts"), "utf8");
    expect(src).toContain("profile.ativo === false || profile.deleted_at");
  });
});

describe("fluxo de senha", () => {
  it("rota /primeiro-acesso foi removida", () => {
    expect(existsSync(join(process.cwd(), "src/routes/primeiro-acesso.tsx"))).toBe(false);
  });

  it("setFirstAccessPassword não existe mais", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/invites.functions.ts"), "utf8");
    expect(src).not.toContain("setFirstAccessPassword");
    expect(src).toContain("inviteUserByEmail");
    expect(src).toContain("resetPasswordForEmail");
  });

  it("URL de retorno vem de allowlist, nunca do cliente", async () => {
    const { __test__ } = await import("./invites.functions");
    process.env.APP_PUBLIC_URL = "https://evil.example.com";
    expect(__test__.appBaseUrl()).toBe("https://crm.inplastic.com.br");
    process.env.APP_PUBLIC_URL = "https://crm-inplastic.lovable.app";
    expect(__test__.redirectDefinirSenha()).toBe("https://crm-inplastic.lovable.app/definir-senha");
  });

  it("rate limit corta após 3 tentativas na janela", async () => {
    const { __test__ } = await import("./invites.functions");
    const chave = `teste:${Math.random()}`;
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(false);
  });

  it("concluirTrocaSenha troca a senha no servidor antes de limpar a flag", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/usuarios.functions.ts"), "utf8");
    const trecho = src.slice(src.indexOf("export const concluirTrocaSenha"));
    expect(trecho).toContain("z.object({ password: senhaForte })");
    expect(trecho.indexOf("updateUserById")).toBeLessThan(trecho.indexOf("senha_reset_exigido"));
  });
});

describe("migration preparada (simulação)", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations-preparadas/20260818_p0_seguranca_signup_profiles.sql"),
    "utf8",
  );
  const handleNewUser = sql.slice(
    sql.indexOf("FUNCTION public.handle_new_user"),
    sql.indexOf("FUNCTION public.tg_user_roles_guard"),
  );

  it("signup nunca lê role do metadata", () => {
    expect(handleNewUser).not.toContain("raw_user_meta_data->>'role'");
  });

  it("usuário público nasce vendedor (admin só no bootstrap)", () => {
    expect(handleNewUser).toContain("ELSE 'vendedor'::public.app_role");
  });

  it("promoção a admin exige admin autenticado", () => {
    expect(sql).toContain("Somente administradores podem conceder o papel admin.");
  });

  it("campos administrativos de profiles são preservados para não-admin", () => {
    for (const campo of ["ativo", "deleted_at", "senha_reset_exigido"]) {
      expect(sql).toContain(`NEW.${campo}`);
    }
  });
});
