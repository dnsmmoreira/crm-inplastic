/**
 * Catálogo de cargos.
 *
 * IMPORTANTE: o cargo é APENAS INFORMATIVO. Ele não concede permissão, não
 * define papel (user_roles) e não define perfil de acesso (user_perfis).
 * Nunca acople regra de autorização a este campo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export type CargoRow = { id: string; nome: string; ordem: number };

export const listCargos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cargos")
      .select("id, nome, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      ordem: c.ordem,
    })) satisfies CargoRow[];
  });
