/**
 * Perda por PROPOSTA (Fase 2 do funil).
 *
 * - `recusarProposta`: grava motivo/detalhe/data na proposta, leva o lead para
 *   "perdido" só quando não resta nenhuma outra proposta viva e cria a tarefa
 *   de recontato (idempotente).
 * - `reabrirProposta`: volta para "enviada", limpa a recusa e traz o lead de
 *   volta para "proposta" quando ele estava perdido.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";
import {
  DETALHE_MIN_CHARS,
  DETALHE_OBRIGATORIO_MSG,
  MOTIVOS_PERDA,
  type MotivoPerda,
} from "@/lib/motivos-perda";
import { dataRecontato, leadDeveIrParaPerdido } from "@/lib/proposta-perda";

const STATUS_RECUSAVEL = ["rascunho", "enviada", "aguardando_aprovacao"] as const;

const recusaSchema = z.object({
  propostaId: z.string().uuid(),
  motivo: z.enum(MOTIVOS_PERDA),
  observacao: z.string().trim().min(DETALHE_MIN_CHARS, DETALHE_OBRIGATORIO_MSG),
});

type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Fail-closed: dono da proposta, admin ou `propostas.alterar_status`. */
async function assertPodeAlterarStatus(sb: SB, userId: string, ownerId: string) {
  if (ownerId === userId) return;
  const admin = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (admin.error) {
    await registrarFalhaSegura("propostas-perda/has_role", admin.error, { userId });
    throw new Error("Não foi possível verificar suas permissões agora. Tente novamente.");
  }
  if (admin.data === true) return;
  const perm = await sb.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "propostas.alterar_status",
  });
  if (perm.error) {
    await registrarFalhaSegura("propostas-perda/tem_permissao", perm.error, { userId });
    throw new Error("Não foi possível verificar suas permissões agora. Tente novamente.");
  }
  if (perm.data === true) return;
  throw new Error("Você não tem permissão para alterar o status desta proposta.");
}

async function auditar(
  sb: SB,
  userId: string,
  campo: string,
  anterior: string | null,
  novo: string | null,
) {
  const audit = await sb.from("user_audit_log").insert({
    alvo_user_id: userId,
    ator_user_id: userId,
    campo,
    valor_anterior: anterior,
    valor_novo: novo,
  });
  if (audit?.error) {
    await registrarFalhaSegura(`propostas-perda/${campo}/auditoria`, audit.error, { userId });
  }
}

export const recusarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recusaSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; leadPerdido: boolean }> => {
    const { recusarPropostaImpl } = await import("@/lib/propostas-perda.server");
    const r = await recusarPropostaImpl(context.supabase as unknown as SB, context.userId, {
      propostaId: data.propostaId,
      motivo: data.motivo as MotivoPerda,
      observacao: data.observacao,
    });
    return { ok: true as const, leadPerdido: r.leadPerdido };
  });

export const reabrirProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ propostaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; leadReaberto: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const userId = context.userId;

    const { data: prop, error: propErr } = await sb
      .from("propostas")
      .select("id, number, status, owner_id, lead_id, motivo_recusa")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (propErr) {
      await registrarFalhaSegura("propostas-perda.reabrir/leitura", propErr, {
        proposta_id: data.propostaId,
      });
      throw new Error("Não foi possível carregar a proposta.");
    }
    if (!prop) throw new Error("Proposta não encontrada.");
    await assertPodeAlterarStatus(sb, userId, prop.owner_id);
    if (prop.status !== "recusada") {
      throw new Error("Só é possível reabrir propostas recusadas.");
    }

    const upd = await sb
      .from("propostas")
      .update({
        status: "enviada",
        motivo_recusa: null,
        recusa_detalhe: null,
        recusada_em: null,
        recusada_por: null,
        reaberta_em: new Date().toISOString(),
      })
      .eq("id", prop.id);
    await assertNoError(upd, "propostas-perda.reabrir/update", { proposta_id: prop.id });

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, stage")
      .eq("id", prop.lead_id)
      .maybeSingle();
    if (leadErr) {
      await registrarFalhaSegura("propostas-perda.reabrir/lead", leadErr, {
        lead_id: prop.lead_id,
      });
      throw new Error("Não foi possível carregar o lead da proposta.");
    }

    let leadReaberto = false;
    if (lead?.stage === "perdido") {
      // Sair de `perdido` é bloqueado pelo trigger `trg_leads_stage_lock` para
      // o usuário autenticado: a etapa vai pelo caminho do sistema e os campos
      // da perda são limpos em um UPDATE separado (que não toca em `stage`).
      const { moverStageLeadSistema } = await import("@/lib/leads-stage.server");
      const movida = await moverStageLeadSistema({
        leadId: prop.lead_id,
        para: "proposta",
        de: "perdido",
        origem: "reabertura_proposta",
      });
      await assertNoError(
        movida.ok ? { error: null } : { error: { message: movida.erro } },
        "propostas-perda.reabrir/lead-update",
        { lead_id: prop.lead_id },
      );
      const limpa = await sb
        .from("leads")
        .update({
          motivo_perda: null,
          motivo_perda_detalhe: null,
          perdido_em: null,
          recontatar_em: null,
        })
        .eq("id", prop.lead_id);
      await assertNoError(limpa, "propostas-perda.reabrir/lead-limpeza", {
        lead_id: prop.lead_id,
      });
      leadReaberto = true;
    }

    await auditar(
      sb,
      userId,
      "proposta_reaberta",
      `recusada — ${prop.motivo_recusa ?? "sem motivo"}`,
      `${prop.number} — enviada`,
    );
    return { ok: true as const, leadReaberto };
  });
