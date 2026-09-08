/**
 * Painel do gestor: resumo "sem próximo ato" e cobrança de uma pessoa.
 * Gate fail-closed: admin, `usuarios.gerenciar` ou gestor direto da pessoa.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import type { ResumoEquipe } from "@/lib/equipe.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

async function contexto(sb: LooseClient, userId: string) {
  const { data: admin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: gerencia } = await sb.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "usuarios.gerenciar",
  });
  const { data: liderados, error } = await sb
    .from("profiles")
    .select("id")
    .eq("gestor_id", userId)
    .eq("ativo", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Falha ao carregar equipe: ${error.message}`);
  return {
    admin: Boolean(admin),
    gerencia: Boolean(gerencia),
    liderados: ((liderados ?? []) as { id: string }[]).map((r) => r.id),
  };
}

export const resumoEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoEquipe & { podeCobrarTodos: boolean }> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    const ctx = await contexto(sb, userId);
    if (!ctx.admin && !ctx.gerencia && ctx.liderados.length === 0) {
      throw new Error("Sem acesso ao painel da equipe.");
    }
    const { coletarResumoEquipe } = await import("@/lib/equipe.server");
    const resumo = await coletarResumoEquipe(sb, {
      userIds: ctx.admin || ctx.gerencia ? null : ctx.liderados,
    });
    return { ...resumo, podeCobrarTodos: ctx.admin };
  });

export const cobrarPessoa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; texto: string }) =>
    z.object({ userId: z.string().uuid(), texto: z.string().min(10).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb: LooseClient = context.supabase;
    const ator = context.userId as string;
    const ctx = await contexto(sb, ator);
    const permitido = ctx.admin || ctx.gerencia || ctx.liderados.includes(data.userId);
    if (!permitido) return { ok: false as const, message: "Você não pode cobrar essa pessoa." };
    if (data.userId === ator) return { ok: false as const, message: "Não dá para cobrar a si mesmo." };

    const texto = data.texto.trim();
    const ins = await sb.from("notificacoes").insert({
      user_id: data.userId,
      tipo: "cobranca_gestor",
      titulo: texto.slice(0, 300),
      exige_aceite: true,
    });
    if (ins?.error) throw new Error(`Não foi possível enviar a cobrança: ${ins.error.message}`);

    const { notifyOwner } = await import("@/lib/xerife/notify.server");
    await notifyOwner(data.userId, `📣 *Cobrança da gestão*\n\n${texto}`);

    const audit = await sb.from("user_audit_log").insert({
      ator_user_id: ator,
      alvo_user_id: data.userId,
      campo: "cobranca_gestor",
      valor_novo: texto.slice(0, 1000),
    });
    if (audit?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("equipe.cobrarPessoa/auditoria", audit.error, {
        alvo: data.userId,
      });
    }
    return { ok: true as const };
  });
