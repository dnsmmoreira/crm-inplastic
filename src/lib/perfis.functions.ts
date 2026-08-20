import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type PermissaoCatalogo = {
  chave: string;
  grupo: string;
  rotulo: string;
  descricao: string | null;
  tipo: "booleana" | "numerica";
};

/** Rótulo de papel exibido na UI. O base_role (escopo de dados) é derivado dele. */
export type PapelRotulo = "Vendas" | "Operacional" | "Administrador";

export const PAPEIS: PapelRotulo[] = ["Vendas", "Operacional", "Administrador"];

export function baseRoleDoPapel(papel: PapelRotulo): "admin" | "vendedor" {
  return papel === "Administrador" ? "admin" : "vendedor";
}

export type PerfilRow = {
  id: string;
  nome: string;
  descricao: string | null;
  papel: PapelRotulo;
  baseRole: "admin" | "vendedor";
  ativo: boolean;
  usuarios: number;
  permissoes: number;
  protegido: boolean;
};

export type PerfilPermissaoRow = { chave: string; valorNumerico: number | null };

/** Perfis seed de compatibilidade: não podem ser editados/desativados/excluídos. */
export const PERFIS_PROTEGIDOS = ["Administrador", "Vendedor"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertGerenciaUsuarios(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "usuarios.gerenciar",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Você não tem permissão para gerenciar perfis.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  alvo: string,
  ator: string,
  entradas: Array<{ campo: string; anterior: unknown; novo: unknown }>,
) {
  const rows = entradas
    .filter((e) => String(e.anterior ?? "") !== String(e.novo ?? ""))
    .map((e) => ({
      alvo_user_id: alvo,
      ator_user_id: ator,
      campo: e.campo,
      valor_anterior: e.anterior === null || e.anterior === undefined ? null : String(e.anterior),
      valor_novo: e.novo === null || e.novo === undefined ? null : String(e.novo),
    }));
  if (rows.length === 0) return;
  const { error } = await sb.from("user_audit_log").insert(rows);
  if (error) console.error("[perfis] auditoria falhou:", error.message);
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export const listCatalogoPermissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const { data, error } = await sb
      .from("permissoes")
      .select("chave, grupo, rotulo, descricao, tipo")
      .order("grupo", { ascending: true })
      .order("chave", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      chave: p.chave,
      grupo: p.grupo,
      rotulo: p.rotulo,
      descricao: p.descricao,
      tipo: (p.tipo === "numerica" ? "numerica" : "booleana") as "booleana" | "numerica",
    })) satisfies PermissaoCatalogo[];
  });

export const listPerfis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const [perfisRes, vincRes, permsRes] = await Promise.all([
      sb.from("perfis").select("id, nome, descricao, papel, base_role, ativo").order("nome"),
      sb.from("user_perfis").select("perfil_id"),
      sb.from("perfil_permissoes").select("perfil_id"),
    ]);
    if (perfisRes.error) throw new Error(perfisRes.error.message);
    const usuariosPorPerfil = new Map<string, number>();
    (vincRes.data ?? []).forEach((v) =>
      usuariosPorPerfil.set(v.perfil_id, (usuariosPorPerfil.get(v.perfil_id) ?? 0) + 1),
    );
    const permsPorPerfil = new Map<string, number>();
    (permsRes.data ?? []).forEach((v) =>
      permsPorPerfil.set(v.perfil_id, (permsPorPerfil.get(v.perfil_id) ?? 0) + 1),
    );
    return (perfisRes.data ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      papel: (p.papel ?? "Vendas") as PapelRotulo,
      baseRole: p.base_role as "admin" | "vendedor",
      ativo: p.ativo !== false,
      usuarios: usuariosPorPerfil.get(p.id) ?? 0,
      permissoes: permsPorPerfil.get(p.id) ?? 0,
      protegido: PERFIS_PROTEGIDOS.includes(p.nome),
    })) satisfies PerfilRow[];
  });

export const listPerfilPermissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ perfilId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("perfil_permissoes")
      .select("permissao_chave, valor_numerico")
      .eq("perfil_id", data.perfilId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      chave: r.permissao_chave,
      valorNumerico: r.valor_numerico === null ? null : Number(r.valor_numerico),
    })) satisfies PerfilPermissaoRow[];
  });

/** Perfis ativos + o perfil atualmente vinculado a um usuário (para o seletor). */
export const getPerfilDoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const [perfisRes, vincRes] = await Promise.all([
      sb.from("perfis").select("id, nome, papel, base_role, ativo").order("nome"),
      sb.from("user_perfis").select("perfil_id").eq("user_id", data.userId),
    ]);
    if (perfisRes.error) throw new Error(perfisRes.error.message);
    const atual = (vincRes.data ?? [])[0]?.perfil_id ?? null;
    return {
      perfilId: atual as string | null,
      perfis: (perfisRes.data ?? [])
        .filter((p) => p.ativo !== false || p.id === atual)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          papel: (p.papel ?? "Vendas") as PapelRotulo,
          baseRole: p.base_role as "admin" | "vendedor",
          ativo: p.ativo !== false,
        })),
    };
  });

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

const perfilSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(300).nullable(),
  papel: z.enum(["Vendas", "Operacional", "Administrador"]),
  ativo: z.boolean(),
});

export const savePerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => perfilSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const ator = context.userId;
    // base_role é DERIVADO do papel — nunca escolhido manualmente.
    const baseRole = baseRoleDoPapel(data.papel);

    if (!data.id) {
      const { data: novo, error } = await sb
        .from("perfis")
        .insert({
          nome: data.nome,
          descricao: data.descricao,
          papel: data.papel,
          base_role: baseRole,
          ativo: data.ativo,
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(
          error.code === "23505" ? "Já existe um perfil com esse nome." : error.message,
        );
      }
      await logAudit(sb, ator, ator, [
        { campo: `perfil:${data.nome}`, anterior: null, novo: "criado" },
      ]);
      return { id: novo.id as string };
    }

    const { data: atual, error: aErr } = await sb
      .from("perfis")
      .select("nome, descricao, papel, base_role, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!atual) throw new Error("Perfil não encontrado.");
    if (PERFIS_PROTEGIDOS.includes(atual.nome)) {
      throw new Error(`O perfil "${atual.nome}" é padrão do sistema e não pode ser alterado.`);
    }

    const { error } = await sb
      .from("perfis")
      .update({
        nome: data.nome,
        descricao: data.descricao,
        papel: data.papel,
        base_role: baseRole,
        ativo: data.ativo,
      })
      .eq("id", data.id);
    if (error) {
      throw new Error(
        error.code === "23505" ? "Já existe um perfil com esse nome." : error.message,
      );
    }

    await logAudit(sb, ator, ator, [
      { campo: `perfil:${atual.nome}:nome`, anterior: atual.nome, novo: data.nome },
      { campo: `perfil:${atual.nome}:descricao`, anterior: atual.descricao, novo: data.descricao },
      { campo: `perfil:${atual.nome}:papel`, anterior: atual.papel, novo: data.papel },
      { campo: `perfil:${atual.nome}:base_role`, anterior: atual.base_role, novo: baseRole },
      {
        campo: `perfil:${atual.nome}:ativo`,
        anterior: atual.ativo ? "sim" : "não",
        novo: data.ativo ? "sim" : "não",
      },
    ]);
    return { id: data.id };
  });

export const deletePerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ perfilId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const { data: perfil } = await sb
      .from("perfis")
      .select("nome")
      .eq("id", data.perfilId)
      .maybeSingle();
    if (!perfil) throw new Error("Perfil não encontrado.");
    if (PERFIS_PROTEGIDOS.includes(perfil.nome)) {
      throw new Error(`O perfil "${perfil.nome}" é padrão do sistema e não pode ser excluído.`);
    }
    const { count } = await sb
      .from("user_perfis")
      .select("user_id", { count: "exact", head: true })
      .eq("perfil_id", data.perfilId);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Este perfil tem ${count} usuário(s) vinculado(s). Desative-o em vez de excluir.`,
      );
    }
    const { error } = await sb.from("perfis").delete().eq("id", data.perfilId);
    if (error) throw new Error(error.message);
    await logAudit(sb, context.userId, context.userId, [
      { campo: `perfil:${perfil.nome}`, anterior: "ativo", novo: "excluído" },
    ]);
    return { ok: true as const };
  });

export const setPerfilPermissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        perfilId: z.string().uuid(),
        permissoes: z
          .array(
            z.object({
              chave: z.string().min(1).max(80),
              valorNumerico: z.number().nullable().optional(),
            }),
          )
          .max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const { data: perfil } = await sb
      .from("perfis")
      .select("nome")
      .eq("id", data.perfilId)
      .maybeSingle();
    if (!perfil) throw new Error("Perfil não encontrado.");
    if (PERFIS_PROTEGIDOS.includes(perfil.nome)) {
      throw new Error(
        `O perfil "${perfil.nome}" é padrão do sistema; sua matriz é somente leitura.`,
      );
    }

    const { data: antes } = await sb
      .from("perfil_permissoes")
      .select("permissao_chave, valor_numerico")
      .eq("perfil_id", data.perfilId);
    const mapAntes = new Map(
      (antes ?? []).map((r) => [
        r.permissao_chave,
        r.valor_numerico === null ? null : Number(r.valor_numerico),
      ]),
    );

    const { error: delErr } = await sb
      .from("perfil_permissoes")
      .delete()
      .eq("perfil_id", data.perfilId);
    if (delErr) throw new Error(delErr.message);

    if (data.permissoes.length > 0) {
      const { error } = await sb.from("perfil_permissoes").insert(
        data.permissoes.map((p) => ({
          perfil_id: data.perfilId,
          permissao_chave: p.chave,
          valor_numerico: p.valorNumerico ?? null,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const mapDepois = new Map(data.permissoes.map((p) => [p.chave, p.valorNumerico ?? null]));
    const chaves = new Set([...mapAntes.keys(), ...mapDepois.keys()]);
    const audit: Array<{ campo: string; anterior: unknown; novo: unknown }> = [];
    for (const chave of chaves) {
      const tinha = mapAntes.has(chave);
      const tem = mapDepois.has(chave);
      const anterior = tinha ? (mapAntes.get(chave) ?? "sim") : "não";
      const novo = tem ? (mapDepois.get(chave) ?? "sim") : "não";
      audit.push({ campo: `perfil:${perfil.nome}:${chave}`, anterior, novo });
    }
    await logAudit(sb, context.userId, context.userId, audit);
    return { ok: true as const };
  });

export const setPerfilDoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ userId: z.string().uuid(), perfilId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertGerenciaUsuarios(context.supabase, context.userId);
    // Somente admin altera perfil de acesso de alguém.
    const { data: ehAdmin, error: adminErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!ehAdmin) throw new Error("Apenas administradores podem alterar o perfil de acesso.");
    if (data.userId === context.userId) {
      throw new Error("Você não pode alterar o próprio perfil de acesso.");
    }
    const sb = await admin();

    const { data: atuais } = await sb
      .from("user_perfis")
      .select("perfil_id")
      .eq("user_id", data.userId);
    const anteriorId = (atuais ?? [])[0]?.perfil_id ?? null;
    if (anteriorId === data.perfilId) return { ok: true as const };

    const nomes = new Map<string, string>();
    const baseRoles = new Map<string, "admin" | "vendedor">();
    const ids = [anteriorId, data.perfilId].filter((v): v is string => !!v);
    if (ids.length) {
      const { data: ps } = await sb.from("perfis").select("id, nome, base_role").in("id", ids);
      (ps ?? []).forEach((p) => {
        nomes.set(p.id, p.nome);
        baseRoles.set(p.id, p.base_role as "admin" | "vendedor");
      });
    }
    if (data.perfilId && !nomes.has(data.perfilId)) throw new Error("Perfil não encontrado.");

    const { error: delErr } = await sb.from("user_perfis").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    if (data.perfilId) {
      const { error } = await sb
        .from("user_perfis")
        .insert({ user_id: data.userId, perfil_id: data.perfilId });
      if (error) throw new Error(error.message);
    }

    // Papel (user_roles) é DERIVADO do base_role do perfil escolhido.
    const { data: rolesAtuais } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const papelAtual: "admin" | "vendedor" = (rolesAtuais ?? []).some((r) => r.role === "admin")
      ? "admin"
      : "vendedor";
    const papelNovo: "admin" | "vendedor" = data.perfilId
      ? (baseRoles.get(data.perfilId) ?? "vendedor")
      : "vendedor";
    if (papelNovo !== papelAtual) {
      const { error: delRoleErr } = await sb.from("user_roles").delete().eq("user_id", data.userId);
      if (delRoleErr) throw new Error(delRoleErr.message);
      const { error: insRoleErr } = await sb
        .from("user_roles")
        .insert({ user_id: data.userId, role: papelNovo });
      if (insRoleErr) throw new Error(insRoleErr.message);
    }

    await logAudit(sb, data.userId, context.userId, [
      { campo: "papel", anterior: papelAtual, novo: papelNovo },
      {
        campo: "perfil",
        anterior: anteriorId ? nomes.get(anteriorId) : "nenhum",
        novo: data.perfilId ? nomes.get(data.perfilId) : "nenhum",
      },
    ]);
    return { ok: true as const };
  });
