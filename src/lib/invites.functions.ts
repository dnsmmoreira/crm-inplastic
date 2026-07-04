import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(72),
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

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: data.role },
    });

    if (error) {
      if (/already/i.test(error.message) || /registered/i.test(error.message)) {
        throw new Error("Já existe um usuário com esse e-mail.");
      }
      throw new Error(error.message);
    }

    return { ok: true as const, userId: created.user?.id ?? null, email: data.email };
  });
