import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth as requireSupabaseAuthBase } from "@/integrations/supabase/auth-middleware";

/**
 * Conclusão da recuperação de senha.
 *
 * O link do e-mail cria uma sessão de recuperação. Estas duas funções cercam a
 * troca de senha feita pelo SDK (que é quem aplica a regra de senha vazada):
 *
 *  1. `validarSessaoRedefinicao` — antes de trocar: conta inativa ou excluída
 *     não redefine nada;
 *  2. `concluirRedefinicaoSenha` — depois de trocar: desliga
 *     `senha_reset_exigido` e registra a conclusão em `user_audit_log`.
 *
 * Ambas usam o middleware BASE de propósito: o middleware da aplicação recusa
 * quem está com troca de senha pendente, que é exatamente o caso aqui.
 * Nenhuma delas recebe ou registra a senha.
 */

export const MSG_CONTA_DESATIVADA = "Conta desativada. Fale com o administrador.";

async function contaAtiva(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: perfil, error } = await supabaseAdmin
    .from("profiles")
    .select("ativo, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar a conta. Tente novamente.");
  if (!perfil || perfil.ativo === false || perfil.deleted_at) {
    throw new Error(MSG_CONTA_DESATIVADA);
  }
}

export const validarSessaoRedefinicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthBase])
  .handler(async ({ context }) => {
    await contaAtiva(context.userId);
    return { ok: true as const };
  });

export const concluirRedefinicaoSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthBase])
  .handler(async ({ context }) => {
    await contaAtiva(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ senha_reset_exigido: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    // Auditoria: quem, quando. Nunca a senha, nunca o token, nunca o link.
    await supabaseAdmin.from("user_audit_log").insert({
      user_id: context.userId,
      alterado_por: context.userId,
      campo: "senha",
      valor_anterior: null,
      valor_novo: "senha redefinida pelo link de recuperação",
    } as never);

    return { ok: true as const };
  });
