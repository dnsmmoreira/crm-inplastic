/**
 * Catálogo de cargos.
 *
 * IMPORTANTE: o cargo é APENAS INFORMATIVO. Ele não concede permissão, não
 * define papel (user_roles) e não define perfil de acesso (user_perfis).
 * Nunca acople regra de autorização a este campo.
 *
 * A ÚNICA exceção de comportamento é o cargo "Representante", que torna
 * obrigatório escolher um gestor responsável na ficha do usuário — e isso é
 * regra de NOTIFICAÇÃO (cópia informativa), nunca de acesso.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";

export type CargoRow = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  /** Quantos usuários (não excluídos) usam este cargo. */
  emUso: number;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertGerenciarUsuarios(supabase: any, userId: string) {
  const ok = await assertRpcPermissao(
    await supabase.rpc("tem_permissao", { _user_id: userId, _chave: "usuarios.gerenciar" }),
    "cargos/tem_permissao",
    { userId },
  );
  if (!ok) throw new Error("Você não tem permissão para gerenciar cargos.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  ator: string,
  campo: string,
  anterior: unknown,
  novo: unknown,
) {
  const { error } = await sb.from("user_audit_log").insert({
    alvo_user_id: ator,
    ator_user_id: ator,
    campo,
    valor_anterior: anterior == null ? null : String(anterior),
    valor_novo: novo == null ? null : String(novo),
  });
  if (error) console.error("[cargos] auditoria falhou:", error.message);
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/** Só os cargos ATIVOS — usado nos selects de ficha de usuário. */
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
      ativo: true,
      emUso: 0,
    })) satisfies CargoRow[];
  });

/** Catálogo completo (ativos e inativos) com contagem de uso — tela de Cargos. */
export const listCargosAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const [cargosRes, profilesRes] = await Promise.all([
      sb.from("cargos").select("id, nome, ordem, ativo").order("ordem", { ascending: true }),
      sb.from("profiles").select("cargo_id").is("deleted_at", null),
    ]);
    if (cargosRes.error) throw new Error(cargosRes.error.message);
    const uso = new Map<string, number>();
    for (const p of profilesRes.data ?? []) {
      const id = (p as { cargo_id: string | null }).cargo_id;
      if (id) uso.set(id, (uso.get(id) ?? 0) + 1);
    }
    return (cargosRes.data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      ordem: c.ordem,
      ativo: c.ativo !== false,
      emUso: uso.get(c.id) ?? 0,
    })) satisfies CargoRow[];
  });

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

const nomeCargo = z.string().trim().min(2, "Informe o nome do cargo.").max(80);

export const createCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ nome: nomeCargo }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: existentes, error: eErr } = await sb.from("cargos").select("id, nome, ordem");
    if (eErr) throw new Error(eErr.message);
    const alvo = data.nome.toLowerCase();
    if ((existentes ?? []).some((c) => c.nome.trim().toLowerCase() === alvo)) {
      throw new Error("Já existe um cargo com esse nome.");
    }
    const proxima = Math.max(0, ...(existentes ?? []).map((c) => Number(c.ordem ?? 0))) + 1;

    const res = await sb
      .from("cargos")
      .insert({ nome: data.nome, ordem: proxima, ativo: true })
      .select("id")
      .maybeSingle();
    await assertNoError(res, "cargos.createCargo", { nome: data.nome });
    await logAudit(sb, context.userId, "cargo:criado", null, data.nome);
    return { ok: true as const, id: res.data?.id as string | undefined };
  });

export const renameCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), nome: nomeCargo }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: todos, error } = await sb.from("cargos").select("id, nome");
    if (error) throw new Error(error.message);
    const atual = (todos ?? []).find((c) => c.id === data.id);
    if (!atual) throw new Error("Cargo não encontrado.");
    const alvo = data.nome.toLowerCase();
    if ((todos ?? []).some((c) => c.id !== data.id && c.nome.trim().toLowerCase() === alvo)) {
      throw new Error("Já existe um cargo com esse nome.");
    }

    const upd = await sb.from("cargos").update({ nome: data.nome }).eq("id", data.id);
    await assertNoError(upd, "cargos.renameCargo", { id: data.id });

    // Mantém o texto de `profiles.cargo` em sincronia com o catálogo.
    const sync = await sb.from("profiles").update({ cargo: data.nome }).eq("cargo_id", data.id);
    await assertNoError(sync, "cargos.renameCargo/sync-profiles", { id: data.id });

    await logAudit(sb, context.userId, "cargo:renomeado", atual.nome, data.nome);
    return { ok: true as const };
  });

export const setCargoAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: cargo, error } = await sb
      .from("cargos")
      .select("id, nome, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cargo) throw new Error("Cargo não encontrado.");

    if (!data.ativo) {
      const { data: usando, error: uErr } = await sb
        .from("profiles")
        .select("id")
        .eq("cargo_id", data.id)
        .is("deleted_at", null)
        .limit(1);
      if (uErr) throw new Error(uErr.message);
      if ((usando ?? []).length > 0) {
        throw new Error("Este cargo está em uso. Troque o cargo dessas pessoas antes de desativar.");
      }
    }

    const upd = await sb.from("cargos").update({ ativo: data.ativo }).eq("id", data.id);
    await assertNoError(upd, "cargos.setCargoAtivo", { id: data.id });
    await logAudit(
      sb,
      context.userId,
      "cargo:status",
      `${cargo.nome}: ${cargo.ativo !== false ? "ativo" : "inativo"}`,
      `${cargo.nome}: ${data.ativo ? "ativo" : "inativo"}`,
    );
    return { ok: true as const };
  });

export const reorderCargos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();
    let i = 1;
    for (const id of data.ids) {
      const upd = await sb.from("cargos").update({ ordem: i }).eq("id", id);
      await assertNoError(upd, "cargos.reorderCargos", { id });
      i += 1;
    }
    await logAudit(sb, context.userId, "cargo:ordem", null, `${data.ids.length} cargos reordenados`);
    return { ok: true as const };
  });
