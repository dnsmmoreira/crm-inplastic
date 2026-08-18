/**
 * Middleware de autenticação da aplicação.
 *
 * Compõe o `requireSupabaseAuth` gerado (validação do bearer token) com uma
 * checagem adicional de estado da conta: perfil inativo ou excluído não acessa
 * nenhuma server function, mesmo com JWT ainda válido.
 *
 * Use SEMPRE este middleware nas server functions — nunca o gerado direto.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth as requireSupabaseAuthBase } from "@/integrations/supabase/auth-middleware";

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuthBase])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("ativo, deleted_at")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error("Unauthorized: profile check failed");
    if (!profile) throw new Error("Unauthorized: profile not found");
    if (profile.ativo === false || profile.deleted_at) {
      throw new Error("Unauthorized: conta inativa");
    }

    return next();
  });
