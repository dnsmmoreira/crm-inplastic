import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(72).optional().or(z.literal("")),
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

    const hasPassword = typeof data.password === "string" && data.password.length >= 6;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      // Se admin não definir senha, cria usuário sem senha — ele define via /primeiro-acesso.
      ...(hasPassword ? { password: data.password } : {}),
      email_confirm: true,
      user_metadata: { name: data.name, role: data.role },
    });

    if (error) {
      if (/already/i.test(error.message) || /registered/i.test(error.message)) {
        throw new Error("Já existe um usuário com esse e-mail.");
      }
      throw new Error(error.message);
    }

    return {
      ok: true as const,
      userId: created.user?.id ?? null,
      email: data.email,
      requiresFirstAccess: !hasPassword,
    };
  });

// -------- Primeiro acesso --------
// Endpoint PÚBLICO: permite ao usuário definir sua senha apenas se NUNCA logou.
// Após o primeiro login, este endpoint recusa e o usuário deve usar "Esqueci minha senha".

const firstAccessSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(72),
});

export const setFirstAccessPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => firstAccessSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Procura usuário pelo email. Paginação padrão retorna até 50; percorremos algumas páginas por segurança.
    const emailLower = data.email.toLowerCase();
    let found: { id: string; last_sign_in_at: string | null } | null = null;
    for (let page = 1; page <= 5 && !found; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const u = list.users.find((x) => (x.email ?? "").toLowerCase() === emailLower);
      if (u) found = { id: u.id, last_sign_in_at: u.last_sign_in_at ?? null };
      if (list.users.length < 200) break;
    }

    if (!found) {
      throw new Error("E-mail não encontrado. Peça ao administrador para cadastrar seu acesso.");
    }
    if (found.last_sign_in_at) {
      throw new Error(
        "Este usuário já possui acesso definido. Use 'Esqueci minha senha' na tela de login.",
      );
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(found.id, {
      password: data.password,
    });
    if (updErr) throw new Error(updErr.message);

    return { ok: true as const, email: data.email };
  });
