/**
 * Módulo de Representantes (roster de acesso).
 *
 * ESCOPO: representante ativo é um usuário normal (cargo "Representante",
 * papel vendedor). Esta tela apenas LISTA esses usuários com números de
 * atividade e permite ajustar a participação na Arena. Comissão/região são
 * assunto do motor da Arena (`arena_config` / `arena_participacao`) e NÃO são
 * gravados aqui.
 *
 * Gate: `representantes.gerenciar` OU `usuarios.gerenciar`, sempre no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError } from "@/lib/guard-erros";
import {
  CARGO_REPRESENTANTE,
  ehCargoRepresentante,
  inicioDoMes,
  montarRepresentantes,
  type RepresentanteBase,
  type RepresentanteLinha,
} from "@/lib/representantes";

export type { RepresentanteLinha };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Fail-closed: só passa quem tem uma das duas permissões. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertGerenciaRepresentantes(supabase: any, userId: string) {
  for (const chave of ["representantes.gerenciar", "usuarios.gerenciar"]) {
    const { data, error } = await supabase.rpc("tem_permissao", {
      _user_id: userId,
      _chave: chave,
    });
    if (error) throw new Error(error.message);
    if (data === true) return;
  }
  throw new Error("Você não tem permissão para gerenciar representantes.");
}

export const listRepresentantes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepresentanteLinha[]> => {
    await assertGerenciaRepresentantes(context.supabase, context.userId);
    const sb = await admin();

    const { data: profs, error: pErr } = await sb
      .from("profiles")
      .select("id, name, cargo, ativo, deleted_at")
      .eq("cargo", CARGO_REPRESENTANTE);
    await assertNoError({ error: pErr }, "representantes/profiles");
    const base0 = profs ?? [];
    const ids = base0.map((p) => p.id as string);
    if (ids.length === 0) return [];

    const desde = inicioDoMes(new Date());
    const [part, clientes, leads, propostas, conversas] = await Promise.all([
      sb
        .from("arena_participacao")
        .select("user_id, participa_arena, tipo_comercial, comissao_pct, regiao")
        .in("user_id", ids),
      sb.from("clientes").select("vendedor_id").eq("ativo", true).in("vendedor_id", ids),
      sb.from("leads").select("owner_id, stage, updated_at").in("owner_id", ids),
      sb.from("propostas").select("owner_id, created_at").in("owner_id", ids).gte("created_at", desde),
      sb.from("whatsapp_conversas").select("atribuido_para, last_message_at").in("atribuido_para", ids),
    ]);
    await assertNoError(part, "representantes/arena_participacao");
    await assertNoError(clientes, "representantes/clientes");
    await assertNoError(leads, "representantes/leads");
    await assertNoError(propostas, "representantes/propostas");
    await assertNoError(conversas, "representantes/conversas");

    const pMap = new Map((part.data ?? []).map((r) => [r.user_id as string, r]));
    const base: RepresentanteBase[] = base0.map((p) => ({
      id: p.id as string,
      nome: (p.name as string) || "Sem nome",
      ativo: p.ativo !== false,
      deletedAt: (p.deleted_at as string | null) ?? null,
      participaArena: (pMap.get(p.id as string)?.participa_arena as boolean | undefined) ?? null,
      tipoComercial: (pMap.get(p.id as string)?.tipo_comercial as string | null) ?? null,
      comissaoPct:
        pMap.get(p.id as string)?.comissao_pct === null ||
        pMap.get(p.id as string)?.comissao_pct === undefined
          ? null
          : Number(pMap.get(p.id as string)?.comissao_pct),
      regiao: (pMap.get(p.id as string)?.regiao as string | null) ?? null,
    }));

    return montarRepresentantes(base, {
      clientes: (clientes.data ?? []) as { vendedor_id: string | null }[],
      leads: (leads.data ?? []) as { owner_id: string | null; stage: string | null; updated_at: string | null }[],
      propostas: (propostas.data ?? []) as { owner_id: string | null; created_at: string | null }[],
      conversas: (conversas.data ?? []) as { atribuido_para: string | null; last_message_at: string | null }[],
    });
  });

/**
 * Ajusta os dados de representação de um usuário.
 * Hoje só a participação na Arena — comissão e região ficam com o motor da Arena.
 */
export const atualizarDadosRepresentante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), participaArena: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGerenciaRepresentantes(context.supabase, context.userId);
    const sb = await admin();

    const { data: alvo, error: aErr } = await sb
      .from("profiles")
      .select("id, cargo, deleted_at")
      .eq("id", data.userId)
      .maybeSingle();
    await assertNoError({ error: aErr }, "representantes/alvo");
    if (!alvo || alvo.deleted_at) throw new Error("Usuário não encontrado.");
    if (!ehCargoRepresentante(alvo.cargo as string | null)) {
      throw new Error("Este usuário não tem o cargo Representante.");
    }

    const { data: atual, error: cErr } = await sb
      .from("arena_participacao")
      .select("user_id, participa_arena, tipo_comercial")
      .eq("user_id", data.userId)
      .maybeSingle();
    await assertNoError({ error: cErr }, "representantes/participacao-atual");

    const { error: uErr } = await sb.from("arena_participacao").upsert(
      {
        user_id: data.userId,
        participa_arena: data.participaArena,
        // Só define o canal quando a linha ainda não existe: escolha manual manda.
        tipo_comercial: atual?.tipo_comercial ?? "representante",
      },
      { onConflict: "user_id" },
    );
    await assertNoError({ error: uErr }, "representantes/participacao-upsert");

    if ((atual?.participa_arena ?? null) !== data.participaArena) {
      const { error: logErr } = await sb.from("user_audit_log").insert({
        alvo_user_id: data.userId,
        ator_user_id: context.userId,
        campo: "arena_participa",
        valor_anterior: atual ? String(atual.participa_arena) : null,
        valor_novo: String(data.participaArena),
      });
      if (logErr) console.error("[representantes] auditoria falhou:", logErr.message);
    }

    return { ok: true };
  });
