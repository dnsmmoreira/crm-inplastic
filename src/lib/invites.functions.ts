import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.middleware";

/**
 * Criação de usuários e recuperação de senha.
 *
 * Regras de segurança (P0):
 *  • não existe mais endpoint público de "primeiro acesso" — conhecer o e-mail,
 *    o `last_sign_in_at` ou a senha anterior NUNCA autoriza definir senha;
 *  • criação de conta é sempre por convite oficial do Supabase
 *    (`inviteUserByEmail`), com link expirável e de uso único;
 *  • a URL de retorno vem SEMPRE de `APP_PUBLIC_URL` (allowlist fixa),
 *    nunca de Host/Origin/Referer do cliente;
 *  • recuperação de senha responde de forma genérica (não revela se o e-mail
 *    existe) e tem rate limit;
 *  • auditoria nunca registra senha nem token.
 */

// ───────────────────────── URL pública (allowlist fixa) ─────────────────────
const URLS_PERMITIDAS = [
  "https://crm.inplastic.com.br",
  "https://crm-inplastic.lovable.app",
  "http://localhost:8080",
] as const;

function appBaseUrl(): string {
  const env = (process.env.APP_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const permitida = URLS_PERMITIDAS.find((u) => u === env);
  return permitida ?? URLS_PERMITIDAS[0];
}

/** Destino do link de convite / recuperação: rota que só troca a própria senha. */
function redirectDefinirSenha(): string {
  return `${appBaseUrl()}/definir-senha`;
}

// ───────────────────────────── Rate limit simples ───────────────────────────
const janelas = new Map<string, number[]>();
function rateLimit(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const antigos = (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (antigos.length >= maximo) {
    janelas.set(chave, antigos);
    return false;
  }
  antigos.push(agora);
  janelas.set(chave, antigos);
  return true;
}

async function auditar(
  userId: string | null,
  autorId: string | null,
  campo: string,
  novo: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_audit_log").insert({
      user_id: userId,
      alterado_por: autorId,
      campo,
      valor_anterior: null,
      valor_novo: novo,
    } as never);
  } catch {
    // auditoria nunca derruba o fluxo
  }
}

// ─────────────────────────── Criação por convite ────────────────────────────
const createUserSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  role: z.enum(["admin", "vendedor"]).default("vendedor"),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Somente administradores podem criar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { name: data.name, role: data.role },
      redirectTo: redirectDefinirSenha(),
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new Error("Já existe um usuário com esse e-mail.");
      }
      throw new Error(error.message);
    }

    await auditar(created.user?.id ?? null, context.userId, "convite", "convite enviado por e-mail");

    return { ok: true as const, email: data.email, convidado: true as const };
  });

/** Reenvia o convite / link de definição de senha. Somente admin. */
export const reenviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores podem reenviar convites.");
    if (!rateLimit(`convite:${data.email.toLowerCase()}`, 3, 15 * 60_000)) {
      throw new Error("Muitas tentativas para este e-mail. Tente novamente em alguns minutos.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Usuário já existente → link de recuperação; inexistente → convite.
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: redirectDefinirSenha(),
    });
    if (error) {
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: redirectDefinirSenha(),
      });
    }

    await auditar(null, context.userId, "convite", "link de definição de senha reenviado");
    return { ok: true as const };
  });

/**
 * Endpoint público de recuperação: resposta SEMPRE genérica, com rate limit.
 * Não define senha, apenas dispara o e-mail oficial do Supabase.
 */
export const solicitarRecuperacaoSenha = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const chave = `recuperacao:${data.email.toLowerCase()}`;
    if (rateLimit(chave, 3, 15 * 60_000)) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
          redirectTo: redirectDefinirSenha(),
        });
      } catch {
        // silencioso de propósito: não revelar existência do e-mail
      }
    }
    return {
      ok: true as const,
      mensagem: "Se o e-mail estiver cadastrado, você receberá um link para definir a senha.",
    };
  });

export const __test__ = { appBaseUrl, redirectDefinirSenha, rateLimit };
