import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";
import { requireSupabaseAuth as requireSupabaseAuthBase } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type AppRoleName = "admin" | "vendedor";

export type PermissoesUsuario = {
  ver_todos_leads: boolean;
  editar_propostas: boolean;
  excluir_propostas: boolean;
  exportar_dados: boolean;
  ver_relatorios: boolean;
  gerenciar_usuarios: boolean;
  configurar_integracoes: boolean;
};

export const PERMISSAO_KEYS = [
  "ver_todos_leads",
  "editar_propostas",
  "excluir_propostas",
  "exportar_dados",
  "ver_relatorios",
  "gerenciar_usuarios",
  "configurar_integracoes",
] as const;

export type UsuarioRow = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  cargo: string | null;
  telefoneWhatsapp: string | null;
  telegramVinculado: boolean;
  fusoHorario: string;
  ativo: boolean;
  deletedAt: string | null;
  limiteLeads: number | null;
  canaisEntrada: string[];
  senhaResetExigido: boolean;
  createdAt: string;
  ultimoAcesso: string | null;
  role: AppRoleName;
  metaMensal: number;
  naFila: boolean;
  filaPosicao: number | null;
  filaAtivo: boolean;
  permissoes: PermissoesUsuario;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar usuários.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AuthLite = { id: string; email: string; lastSignInAt: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listAuthUsers(sb: any): Promise<Map<string, AuthLite>> {
  const map = new Map<string, AuthLite>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      map.set(u.id, {
        id: u.id,
        email: u.email ?? "",
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) break;
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  alvo: string,
  ator: string,
  entries: Array<{ campo: string; anterior: unknown; novo: unknown }>,
) {
  const rows = entries
    .filter((e) => String(e.anterior ?? "") !== String(e.novo ?? ""))
    .map((e) => ({
      alvo_user_id: alvo,
      ator_user_id: ator,
      campo: e.campo,
      valor_anterior: e.anterior === null || e.anterior === undefined ? null : String(e.anterior),
      valor_novo: e.novo === null || e.novo === undefined ? null : String(e.novo),
    }));
  if (rows.length === 0) return 0;
  const { error } = await sb.from("user_audit_log").insert(rows);
  if (error) console.error("[usuarios] auditoria falhou:", error.message);
  return rows.length;
}

const DEFAULT_PERMS: PermissoesUsuario = {
  ver_todos_leads: false,
  editar_propostas: true,
  excluir_propostas: false,
  exportar_dados: false,
  ver_relatorios: true,
  gerenciar_usuarios: false,
  configurar_integracoes: false,
};

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export const listUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ incluirExcluidos: z.boolean().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const [profilesRes, rolesRes, permsRes, filaRes, metasRes, authMap] = await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: true }),
      sb.from("user_roles").select("user_id, role"),
      sb.from("user_permissions").select("*"),
      sb.from("fila_vendedores").select("user_id, posicao, ativo"),
      sb.from("vendedor_metas").select("user_id, meta_valor_mensal"),
      listAuthUsers(sb),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const roleByUser = new Map<string, AppRoleName>();
    (rolesRes.data ?? []).forEach((r) => {
      if (roleByUser.get(r.user_id) === "admin") return;
      roleByUser.set(r.user_id, r.role as AppRoleName);
    });
    const permByUser = new Map((permsRes.data ?? []).map((p) => [p.user_id, p]));
    const filaByUser = new Map((filaRes.data ?? []).map((f) => [f.user_id, f]));
    const metaByUser = new Map((metasRes.data ?? []).map((m) => [m.user_id, m.meta_valor_mensal]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: UsuarioRow[] = (profilesRes.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => (data.incluirExcluidos ? true : !p.deleted_at))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        const fila = filaByUser.get(p.id);
        const perm = permByUser.get(p.id);
        const auth = authMap.get(p.id);
        return {
          id: p.id,
          name: p.name ?? "",
          email: auth?.email ?? p.email_cache ?? "",
          avatarColor: p.avatar_color ?? "#64748b",
          cargo: p.cargo ?? null,
          telefoneWhatsapp: p.telefone_whatsapp ?? null,
          fusoHorario: p.fuso_horario ?? "America/Sao_Paulo",
          ativo: p.ativo !== false,
          deletedAt: p.deleted_at ?? null,
          limiteLeads: p.limite_leads_simultaneos ?? null,
          canaisEntrada: (p.canais_entrada ?? []) as string[],
          senhaResetExigido: !!p.senha_reset_exigido,
          createdAt: p.created_at,
          ultimoAcesso: auth?.lastSignInAt ?? p.ultimo_acesso_em ?? null,
          role: roleByUser.get(p.id) ?? "vendedor",
          metaMensal: Number(metaByUser.get(p.id) ?? 0),
          naFila: !!fila,
          filaPosicao: fila?.posicao ?? null,
          filaAtivo: fila?.ativo ?? false,
          permissoes: perm
            ? (Object.fromEntries(
                PERMISSAO_KEYS.map((k) => [k, !!perm[k]]),
              ) as unknown as PermissoesUsuario)
            : { ...DEFAULT_PERMS },
        } satisfies UsuarioRow;
      });

    return rows;
  });

export const listAuditoriaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("user_audit_log")
      .select("id, campo, valor_anterior, valor_novo, criado_em, ator_user_id")
      .eq("alvo_user_id", data.userId)
      .order("criado_em", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const atores = [
      ...new Set(
        (rows ?? []).map((r) => r.ator_user_id).filter((v): v is string => typeof v === "string"),
      ),
    ];
    const nomes = new Map<string, string>();
    if (atores.length) {
      const { data: profs } = await sb.from("profiles").select("id, name").in("id", atores);
      (profs ?? []).forEach((p) => nomes.set(p.id, p.name));
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      campo: r.campo,
      anterior: r.valor_anterior,
      novo: r.valor_novo,
      criadoEm: r.criado_em,
      ator: r.ator_user_id ? (nomes.get(r.ator_user_id) ?? "—") : "sistema",
    }));
  });

export const checkEmailDuplicado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ email: z.string().email(), ignoreUserId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const map = await listAuthUsers(sb);
    const alvo = data.email.trim().toLowerCase();
    for (const u of map.values()) {
      if (u.email.toLowerCase() === alvo && u.id !== data.ignoreUserId) {
        return { duplicado: true };
      }
    }
    return { duplicado: false };
  });

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

const updateSchema = z.object({
  userId: z.string().uuid(),
  dados: z
    .object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(255),
      cargo: z.string().trim().max(120).nullable(),
      telefoneWhatsapp: z.string().trim().max(30).nullable(),
      fusoHorario: z.string().trim().max(64),
      avatarColor: z.string().trim().max(20),
    })
    .optional(),
  // `role` NÃO é aceito aqui: o papel (user_roles) é DERIVADO do base_role do
  // perfil escolhido em `setPerfilUsuario`. Aceitá-lo neste endpoint abriria
  // caminho para escalação de privilégio via payload.
  acesso: z
    .object({
      ativo: z.boolean(),
    })
    .optional(),

  vendas: z
    .object({
      metaMensal: z.number().min(0).max(1_000_000_000),
      metaMotivo: z.string().trim().max(300).optional(),
      naFila: z.boolean(),
      filaAtivo: z.boolean(),
      limiteLeads: z.number().int().min(0).max(10000).nullable(),
      canaisEntrada: z.array(z.string().max(40)).max(20),
    })
    .optional(),

  permissoes: z
    .object(
      Object.fromEntries(PERMISSAO_KEYS.map((k) => [k, z.boolean()])) as Record<
        (typeof PERMISSAO_KEYS)[number],
        z.ZodBoolean
      >,
    )
    .optional(),
});

export const updateUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const ator = context.userId;
    const isSelf = ator === data.userId;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("*")
      .eq("id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Usuário não encontrado.");

    const { data: rolesAtuais } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const roleAtual: AppRoleName = (rolesAtuais ?? []).some((r) => r.role === "admin")
      ? "admin"
      : "vendedor";

    const audit: Array<{ campo: string; anterior: unknown; novo: unknown }> = [];

    /* ---- Regras de proteção ---- */
    if (data.acesso) {
      if (isSelf && !data.acesso.ativo) {
        throw new Error("Você não pode desativar a própria conta.");
      }
      if (roleAtual === "admin" && !data.acesso.ativo) {
        const { data: count, error: cErr } = await sb.rpc("admins_ativos_count");
        if (cErr) throw new Error(cErr.message);
        if ((count ?? 0) <= 1) {
          throw new Error("É necessário manter pelo menos um administrador ativo.");
        }
      }
    }

    /* ---- Dados cadastrais ---- */
    if (data.dados) {
      const d = data.dados;
      const authMap = await listAuthUsers(sb);
      const atual = authMap.get(data.userId);
      const emailNovo = d.email.trim().toLowerCase();
      if (atual && atual.email.toLowerCase() !== emailNovo) {
        for (const u of authMap.values()) {
          if (u.id !== data.userId && u.email.toLowerCase() === emailNovo) {
            throw new Error("Já existe outro usuário com esse e-mail.");
          }
        }
        const { error } = await sb.auth.admin.updateUserById(data.userId, { email: emailNovo });
        if (error) throw new Error(error.message);
        audit.push({ campo: "email", anterior: atual.email, novo: emailNovo });
      }

      const patch = {
        name: d.name,
        cargo: d.cargo,
        telefone_whatsapp: d.telefoneWhatsapp,
        fuso_horario: d.fusoHorario,
        avatar_color: d.avatarColor,
        email_cache: emailNovo,
      };
      audit.push(
        { campo: "nome", anterior: profile.name, novo: d.name },
        { campo: "cargo", anterior: profile.cargo, novo: d.cargo },
        { campo: "telefone", anterior: profile.telefone_whatsapp, novo: d.telefoneWhatsapp },
        { campo: "fuso_horario", anterior: profile.fuso_horario, novo: d.fusoHorario },
        { campo: "avatar_color", anterior: profile.avatar_color, novo: d.avatarColor },
      );
      const { error } = await sb.from("profiles").update(patch).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    /* ---- Acesso e segurança (papel NÃO é alterado aqui) ---- */
    if (data.acesso) {
      if (data.acesso.ativo !== (profile.ativo !== false)) {
        const { error } = await sb
          .from("profiles")
          .update({ ativo: data.acesso.ativo })
          .eq("id", data.userId);
        if (error) throw new Error(error.message);
        audit.push({
          campo: "status",
          anterior: profile.ativo !== false ? "ativo" : "inativo",
          novo: data.acesso.ativo ? "ativo" : "inativo",
        });
        if (!data.acesso.ativo) await revokeSessions(sb, data.userId);
      }
    }

    /* ---- Vendas ---- */
    if (data.vendas) {
      const v = data.vendas;

      const { data: metaAtual } = await sb
        .from("vendedor_metas")
        .select("meta_valor_mensal")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (Number(metaAtual?.meta_valor_mensal ?? 0) !== v.metaMensal) {
        const { error } = await sb
          .from("vendedor_metas")
          .upsert(
            { user_id: data.userId, meta_valor_mensal: v.metaMensal },
            { onConflict: "user_id" },
          );
        if (error) throw new Error(error.message);
        audit.push({
          campo: "meta_mensal",
          anterior: metaAtual?.meta_valor_mensal ?? 0,
          novo: v.metaMensal,
        });
        const motivo = (v.metaMotivo ?? "").trim();
        if (motivo) {
          audit.push({ campo: "meta_mensal_motivo", anterior: null, novo: motivo });
        }
      }

      const { data: filaAtual } = await sb
        .from("fila_vendedores")
        .select("user_id, posicao, ativo")
        .eq("user_id", data.userId)
        .maybeSingle();

      if (v.naFila && !filaAtual) {
        const { data: max } = await sb
          .from("fila_vendedores")
          .select("posicao")
          .order("posicao", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = Number(max?.posicao ?? 0) + 10;
        const { error } = await sb
          .from("fila_vendedores")
          .insert({ user_id: data.userId, posicao: nextPos, ativo: v.filaAtivo });
        if (error) throw new Error(error.message);
        audit.push({ campo: "fila", anterior: "fora", novo: `posição ${nextPos}` });
      } else if (!v.naFila && filaAtual) {
        const { error } = await sb.from("fila_vendedores").delete().eq("user_id", data.userId);
        if (error) throw new Error(error.message);
        audit.push({ campo: "fila", anterior: `posição ${filaAtual.posicao}`, novo: "fora" });
      } else if (v.naFila && filaAtual && filaAtual.ativo !== v.filaAtivo) {
        const { error } = await sb
          .from("fila_vendedores")
          .update({ ativo: v.filaAtivo })
          .eq("user_id", data.userId);
        if (error) throw new Error(error.message);
        audit.push({
          campo: "fila_ativo",
          anterior: filaAtual.ativo ? "sim" : "não",
          novo: v.filaAtivo ? "sim" : "não",
        });
      }

      const canaisAntes = ((profile.canais_entrada ?? []) as string[]).join(",");
      const canaisDepois = v.canaisEntrada.join(",");
      const { error: upErr } = await sb
        .from("profiles")
        .update({
          limite_leads_simultaneos: v.limiteLeads,
          canais_entrada: v.canaisEntrada,
        })
        .eq("id", data.userId);
      if (upErr) throw new Error(upErr.message);
      audit.push(
        {
          campo: "limite_leads",
          anterior: profile.limite_leads_simultaneos,
          novo: v.limiteLeads,
        },
        { campo: "canais_entrada", anterior: canaisAntes, novo: canaisDepois },
      );
    }

    /* ---- Permissões ---- */
    if (data.permissoes) {
      const perms = { ...data.permissoes };
      if (isSelf && !perms.gerenciar_usuarios) {
        throw new Error("Você não pode remover a própria permissão de gerenciar usuários.");
      }
      const { data: permAtual } = await sb
        .from("user_permissions")
        .select("*")
        .eq("user_id", data.userId)
        .maybeSingle();
      const { error } = await sb
        .from("user_permissions")
        .upsert({ user_id: data.userId, ...perms }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      for (const k of PERMISSAO_KEYS) {
        audit.push({
          campo: `permissao:${k}`,
          anterior: permAtual ? (permAtual[k] ? "sim" : "não") : undefined,
          novo: perms[k] ? "sim" : "não",
        });
      }
    }

    await logAudit(sb, data.userId, ator, audit);
    return { ok: true as const };
  });

export const setUsuarioAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.ativo) {
      throw new Error("Você não pode desativar a própria conta.");
    }
    const sb = await admin();
    if (!data.ativo) {
      const isAdmin = await assertRpcPermissao(
        await sb.rpc("has_role", { _user_id: data.userId, _role: "admin" }),
        "usuarios.setUsuarioAtivo/has_role",
        { userId: data.userId },
      );
      if (isAdmin) {
        const count = await assertRpcPermissao(
          await sb.rpc("admins_ativos_count"),
          "usuarios.setUsuarioAtivo/admins_ativos_count",
          { userId: data.userId },
          "Não foi possível confirmar quantos administradores estão ativos. Operação bloqueada por segurança.",
        );
        if (count == null || Number(count) <= 1) {
          throw new Error("É necessário manter pelo menos um administrador ativo.");
        }
      }
    }
    const { error } = await sb.from("profiles").update({ ativo: data.ativo }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    if (!data.ativo) await revokeSessions(sb, data.userId);
    await logAudit(sb, data.userId, context.userId, [
      {
        campo: "status",
        anterior: data.ativo ? "inativo" : "ativo",
        novo: data.ativo ? "ativo" : "inativo",
      },
    ]);
    return { ok: true as const };
  });

export const forcarRedefinicaoSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    // Zera a senha para um valor aleatório inacessível e marca o fluxo de primeiro acesso.
    const random = `Rst-${crypto.randomUUID()}`;
    const { error: aErr } = await sb.auth.admin.updateUserById(data.userId, { password: random });
    if (aErr) throw new Error(aErr.message);

    const { error } = await sb
      .from("profiles")
      .update({ senha_reset_exigido: true })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await revokeSessions(sb, data.userId);
    await logAudit(sb, data.userId, context.userId, [
      { campo: "senha", anterior: "definida", novo: "redefinição exigida" },
    ]);
    return { ok: true as const };
  });

export const encerrarSessoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const ok = await revokeSessions(sb, data.userId);
    if (!ok) throw new Error("Não foi possível encerrar as sessões deste usuário.");
    await logAudit(sb, data.userId, context.userId, [
      { campo: "sessoes", anterior: "ativas", novo: "encerradas" },
    ]);
    return { ok: true as const };
  });

/** Revoga as sessões via endpoint administrativo de autenticação. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function revokeSessions(sb: any, userId: string): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}/logout`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global" }),
    });
    if (res.ok) return true;
    console.error("[usuarios] logout admin falhou:", res.status, await res.text());
  } catch (e) {
    console.error("[usuarios] logout admin erro:", e instanceof Error ? e.message : String(e));
  }
  // Fallback: sessão morre na próxima verificação de perfil inativo.
  void sb;
  return false;
}

/* ------------------------------------------------------------------ */
/* Exclusão                                                            */
/* ------------------------------------------------------------------ */

export const softDeleteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta.");
    const sb = await admin();

    const isAdmin = await assertRpcPermissao(
      await sb.rpc("has_role", { _user_id: data.userId, _role: "admin" }),
      "usuarios.softDeleteUsuario/has_role",
      { userId: data.userId },
    );
    if (isAdmin) {
      const count = await assertRpcPermissao(
        await sb.rpc("admins_ativos_count"),
        "usuarios.softDeleteUsuario/admins_ativos_count",
        { userId: data.userId },
        "Não foi possível confirmar quantos administradores estão ativos. Operação bloqueada por segurança.",
      );
      if (count == null || Number(count) <= 1)
        throw new Error("É necessário manter pelo menos um administrador ativo.");
    }

    const { error } = await sb
      .from("profiles")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId, ativo: false })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    // ABORTAR: excluir a conta deixando o usuário na fila de rodízio faria o
    // round-robin distribuir conversas para um vendedor inexistente.
    const delFila = await sb.from("fila_vendedores").delete().eq("user_id", data.userId);
    await assertNoError(
      delFila,
      "usuarios.excluirUsuario/fila_vendedores",
      { userId: data.userId },
      "Não foi possível remover o usuário da fila de rodízio. Nada foi excluído.",
    );
    await revokeSessions(sb, data.userId);
    await logAudit(sb, data.userId, context.userId, [
      { campo: "exclusao", anterior: "ativo", novo: "excluído (lógico)" },
    ]);
    return { ok: true as const };
  });

export const restaurarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { error } = await sb
      .from("profiles")
      .update({ deleted_at: null, deleted_by: null, ativo: true })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await logAudit(sb, data.userId, context.userId, [
      { campo: "exclusao", anterior: "excluído (lógico)", novo: "restaurado" },
    ]);
    return { ok: true as const };
  });

export const hardDeleteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        confirmacaoNome: z.string().min(1),
        reatribuirParaUserId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta.");
    if (data.userId === data.reatribuirParaUserId) {
      throw new Error("Escolha outro usuário para receber os registros.");
    }
    const sb = await admin();

    const { data: profile } = await sb
      .from("profiles")
      .select("id, name")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile) throw new Error("Usuário não encontrado.");
    if (profile.name.trim().toLowerCase() !== data.confirmacaoNome.trim().toLowerCase()) {
      throw new Error("O nome digitado não confere.");
    }

    const { data: destino } = await sb
      .from("profiles")
      .select("id, name, deleted_at")
      .eq("id", data.reatribuirParaUserId)
      .maybeSingle();
    if (!destino || destino.deleted_at) {
      throw new Error("O usuário de destino é inválido.");
    }

    const isAdmin = await assertRpcPermissao(
      await sb.rpc("has_role", { _user_id: data.userId, _role: "admin" }),
      "usuarios.excluirUsuarioDefinitivo/has_role",
      { userId: data.userId },
    );
    if (isAdmin) {
      const count = await assertRpcPermissao(
        await sb.rpc("admins_ativos_count"),
        "usuarios.excluirUsuarioDefinitivo/admins_ativos_count",
        { userId: data.userId },
        "Não foi possível confirmar quantos administradores estão ativos. Operação bloqueada por segurança.",
      );
      if (count == null || Number(count) <= 1)
        throw new Error("É necessário manter pelo menos um administrador ativo.");
    }

    // 1) Reatribuição obrigatória ANTES da exclusão
    const destinoId = data.reatribuirParaUserId;
    const reatribuicoes: Array<[string, string]> = [
      ["leads", "owner_id"],
      ["propostas", "owner_id"],
      ["pedidos", "owner_id"],
      ["clientes", "vendedor_id"],
      ["tarefas", "owner_id"],
    ];
    const resumo: Record<string, number> = {};
    for (const [table, col] of reatribuicoes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: moved, error } = await (sb.from(table as any) as any)
        .update({ [col]: destinoId })
        .eq(col, data.userId)
        .select("id");
      if (error) throw new Error(`Falha ao reatribuir ${table}: ${error.message}`);
      resumo[table] = moved?.length ?? 0;
    }

    // 2) Limpa a fila e registra a auditoria antes de remover a conta
    await sb.from("fila_vendedores").delete().eq("user_id", data.userId);
    await logAudit(sb, data.userId, context.userId, [
      {
        campo: "exclusao_definitiva",
        anterior: profile.name,
        novo: `registros reatribuídos para ${destino.name}`,
      },
    ]);

    // 3) Exclusão definitiva da conta (profiles/roles caem por cascade)
    const { error: delErr } = await sb.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error(delErr.message);

    return { ok: true as const, resumo };
  });

/* ------------------------------------------------------------------ */
/* Definição de senha provisória (admin) e troca obrigatória (usuário)  */
/* ------------------------------------------------------------------ */

const senhaForte = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha é longa demais.")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Use pelo menos uma letra e um número.",
  });

/** Admin define uma senha provisória para outro usuário e força a troca no próximo login. */
export const definirSenhaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), password: senhaForte }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const { error: aErr } = await sb.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (aErr) throw new Error(aErr.message);

    const { error } = await sb
      .from("profiles")
      .update({ senha_reset_exigido: true })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    if (data.userId !== context.userId) await revokeSessions(sb, data.userId);
    await logAudit(sb, data.userId, context.userId, [
      { campo: "senha", anterior: "definida", novo: "senha provisória definida pelo admin" },
    ]);
    return { ok: true as const };
  });

/**
 * O próprio usuário conclui a troca de senha.
 *
 * Exige SEMPRE a senha atual: o servidor reautentica o usuário com
 * `signInWithPassword` antes de aceitar a nova senha, para que uma sessão
 * sequestrada não consiga trocar a senha sem conhecer a original.
 *
 * Usa o middleware BASE de propósito — o middleware da aplicação bloqueia
 * qualquer chamada com `senha_reset_exigido = true`, e esta é justamente a
 * função que precisa rodar nesse estado.
 */
export const concluirTrocaSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthBase])
  .inputValidator((data) =>
    z.object({ senhaAtual: z.string().min(1).max(72), password: senhaForte }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();

    const { data: perfil, error: perfErr } = await sb
      .from("profiles")
      .select("ativo, deleted_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (perfErr) throw new Error(perfErr.message);
    if (!perfil || perfil.ativo === false || perfil.deleted_at) {
      throw new Error("Conta inativa.");
    }

    const { data: authUser, error: aErr } = await sb.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email;
    if (aErr || !email) throw new Error("Não foi possível validar a senha atual.");

    // Cliente efêmero (publishable) só para verificar a senha atual — nunca o
    // cliente administrativo, que não deve receber sessão de usuário.
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
    const verificador = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { error: sErr } = await verificador.auth.signInWithPassword({
      email,
      password: data.senhaAtual,
    });
    if (sErr) throw new Error("Senha atual incorreta.");
    await verificador.auth.signOut();

    if (data.senhaAtual === data.password) {
      throw new Error("A nova senha deve ser diferente da atual.");
    }

    const { error: pErr } = await sb.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (pErr) throw new Error(pErr.message);

    const { error } = await sb
      .from("profiles")
      .update({ senha_reset_exigido: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    await logAudit(sb, context.userId, context.userId, [
      { campo: "senha", anterior: "troca exigida", novo: "senha atualizada pelo usuário" },
    ]);
    return { ok: true as const };
  });
