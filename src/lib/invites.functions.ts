import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { appBaseUrl, appUrl } from "@/lib/app-url";
import { assertRpcPermissao, registrarFalhaSegura } from "@/lib/guard-erros";

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

// ── URL pública: fonte única em `@/lib/app-url` (allowlist fixa, nunca cliente) ──
/** Destino do link de convite / recuperação: rota que só troca a própria senha. */
function redirectDefinirSenha(): string {
  return appUrl("/definir-senha");
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
    // REGISTRAR E SEGUIR: auditoria nunca derruba o fluxo de convite, mas a
    // perda de trilha precisa ficar visível em /falhas.
    const ins = await supabaseAdmin.from("user_audit_log").insert({
      user_id: userId,
      alterado_por: autorId,
      campo,
      valor_anterior: null,
      valor_novo: novo,
    } as never);
    if (ins.error) {
      await registrarFalhaSegura("invites.auditoria", ins.error, { user_id: userId, campo });
    }
  } catch (e) {
    await registrarFalhaSegura("invites.auditoria", e, { user_id: userId, campo });
  }
}

// ─────────────────────────── Criação por convite ────────────────────────────
const createUserSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  /** Obrigatório: conta nunca nasce sem perfil de acesso. O papel vem do perfil. */
  perfilId: z.string().uuid("Selecione o perfil de acesso"),
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

    // O perfil precisa existir e estar ativo ANTES de convidar — evita conta órfã.
    const { data: perfil, error: perfilErr } = await supabaseAdmin
      .from("perfis")
      .select("id, nome, base_role, ativo")
      .eq("id", data.perfilId)
      .maybeSingle();
    if (perfilErr) throw new Error(perfilErr.message);
    if (!perfil || perfil.ativo === false) {
      throw new Error("Perfil de acesso inválido ou inativo.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { name: data.name, role: perfil.base_role },
      redirectTo: redirectDefinirSenha(),
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new Error("Já existe um usuário com esse e-mail.");
      }
      throw new Error(error.message);
    }

    await auditar(
      created.user?.id ?? null,
      context.userId,
      "convite",
      "convite enviado por e-mail",
    );

    // Mesma regra da edição: grava user_perfis e deriva user_roles do perfil.
    const novoId = created.user?.id ?? null;
    if (!novoId) {
      throw new Error(
        "Convite enviado, mas o sistema não recebeu o identificador do usuário. Abra a ficha dele e defina o perfil de acesso.",
      );
    }
    const { aplicarPerfilNoUsuario } = await import("@/lib/perfil-vinculo.server");
    try {
      await aplicarPerfilNoUsuario(supabaseAdmin, novoId, data.perfilId);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Convite enviado para ${data.email}, mas o perfil "${perfil.nome}" não pôde ser aplicado (${motivo}). Abra a ficha do usuário e defina o perfil de acesso.`,
      );
    }
    await auditar(novoId, context.userId, "perfil", `perfil "${perfil.nome}" na criação`);

    return {
      ok: true as const,
      email: data.email,
      convidado: true as const,
      perfil: perfil.nome as string,
    };
  });

/** Reenvia o convite / link de definição de senha. Somente admin. */
export const reenviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await assertRpcPermissao(
      await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      "invites.reenviarConvite/has_role",
      { userId: context.userId },
    );
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
