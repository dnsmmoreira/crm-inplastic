/**
 * Catálogo de equipes comerciais.
 *
 * A equipe é usada pela RLS (`mesma_equipe`) para definir o que um Supervisor
 * ADM enxerga. O NOME é apenas rótulo — nenhuma regra depende do texto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";

export type EquipeRow = {
  id: string;
  nome: string;
  ativo: boolean;
  /** Quantas pessoas (não excluídas) estão nesta equipe. */
  emUso: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertGerenciarUsuarios(supabase: any, userId: string) {
  const ok = await assertRpcPermissao(
    await supabase.rpc("tem_permissao", { _user_id: userId, _chave: "usuarios.gerenciar" }),
    "equipes/tem_permissao",
    { userId },
  );
  if (!ok) throw new Error("Você não tem permissão para gerenciar equipes.");
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
  const { inserirMonitorado } = await import("@/lib/rls-monitor.server");
  await inserirMonitorado(
    sb,
    "user_audit_log",
    {
      alvo_user_id: ator,
      ator_user_id: ator,
      campo,
      valor_anterior: anterior == null ? null : String(anterior),
      valor_novo: novo == null ? null : String(novo),
    },
    { acao: "equipes.auditoria", ator_user_id: ator, campo },
  );
}

const nomeEquipe = z.string().trim().min(2, "Informe o nome da equipe.").max(80);

/** Só as equipes ATIVAS — usado no seletor da ficha de usuário. */
export const listEquipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("equipes")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((e) => ({
      id: e.id,
      nome: e.nome,
      ativo: true,
      emUso: 0,
    })) satisfies EquipeRow[];
  });

/** Catálogo completo (ativas e inativas) com contagem de pessoas. */
export const listEquipesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();
    const [equipesRes, profilesRes] = await Promise.all([
      sb.from("equipes").select("id, nome, ativo").order("nome", { ascending: true }),
      sb.from("profiles").select("equipe_id").is("deleted_at", null),
    ]);
    if (equipesRes.error) throw new Error(equipesRes.error.message);
    const uso = new Map<string, number>();
    for (const p of profilesRes.data ?? []) {
      const id = (p as { equipe_id: string | null }).equipe_id;
      if (id) uso.set(id, (uso.get(id) ?? 0) + 1);
    }
    return (equipesRes.data ?? []).map((e) => ({
      id: e.id,
      nome: e.nome,
      ativo: e.ativo !== false,
      emUso: uso.get(e.id) ?? 0,
    })) satisfies EquipeRow[];
  });

export const createEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ nome: nomeEquipe }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: existentes, error } = await sb.from("equipes").select("id, nome");
    if (error) throw new Error(error.message);
    const alvo = data.nome.toLowerCase();
    if ((existentes ?? []).some((e) => e.nome.trim().toLowerCase() === alvo)) {
      throw new Error("Já existe uma equipe com esse nome.");
    }

    const res = await sb
      .from("equipes")
      .insert({ nome: data.nome, ativo: true })
      .select("id")
      .maybeSingle();
    await assertNoError(res, "equipes.createEquipe", { nome: data.nome });
    await logAudit(sb, context.userId, "equipe:criada", null, data.nome);
    return { ok: true as const, id: res.data?.id as string | undefined };
  });

export const renameEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), nome: nomeEquipe }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: todas, error } = await sb.from("equipes").select("id, nome");
    if (error) throw new Error(error.message);
    const atual = (todas ?? []).find((e) => e.id === data.id);
    if (!atual) throw new Error("Equipe não encontrada.");
    const alvo = data.nome.toLowerCase();
    if ((todas ?? []).some((e) => e.id !== data.id && e.nome.trim().toLowerCase() === alvo)) {
      throw new Error("Já existe uma equipe com esse nome.");
    }

    const upd = await sb.from("equipes").update({ nome: data.nome }).eq("id", data.id).select("id");
    await assertNoError(upd, "equipes.renameEquipe", { id: data.id });
    if ((upd.data ?? []).length === 0) throw new Error("Não foi possível renomear a equipe.");

    await logAudit(sb, context.userId, "equipe:renomeada", atual.nome, data.nome);
    return { ok: true as const };
  });

export const setEquipeAtiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertGerenciarUsuarios(context.supabase, context.userId);
    const sb = await admin();

    const { data: equipe, error } = await sb
      .from("equipes")
      .select("id, nome, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!equipe) throw new Error("Equipe não encontrada.");

    if (!data.ativo) {
      const { data: usando, error: uErr } = await sb
        .from("profiles")
        .select("id")
        .eq("equipe_id", data.id)
        .is("deleted_at", null)
        .limit(1);
      if (uErr) throw new Error(uErr.message);
      if ((usando ?? []).length > 0) {
        throw new Error("Esta equipe tem pessoas vinculadas. Mova-as antes de desativar.");
      }
    }

    const upd = await sb
      .from("equipes")
      .update({ ativo: data.ativo })
      .eq("id", data.id)
      .select("id");
    await assertNoError(upd, "equipes.setEquipeAtiva", { id: data.id });
    if ((upd.data ?? []).length === 0) throw new Error("Não foi possível alterar a equipe.");

    await logAudit(
      sb,
      context.userId,
      "equipe:status",
      `${equipe.nome}: ${equipe.ativo !== false ? "ativa" : "inativa"}`,
      `${equipe.nome}: ${data.ativo ? "ativa" : "inativa"}`,
    );
    return { ok: true as const };
  });
