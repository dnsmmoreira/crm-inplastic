import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  role: z.enum(["admin", "vendedor"]).default("vendedor"),
  redirectTo: z.string().url(),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Somente administradores podem convidar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { name: data.name, role: data.role },
      redirectTo: data.redirectTo,
    });

    if (error) {
      // Mensagem mais amigável para caso já exista
      if (/already/i.test(error.message) || /registered/i.test(error.message)) {
        throw new Error("Já existe um usuário com esse e-mail.");
      }
      throw new Error(error.message);
    }

    return { ok: true as const, userId: invited.user?.id ?? null, email: data.email };
  });
