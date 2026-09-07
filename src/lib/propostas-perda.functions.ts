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
    const sb = context.supabase as unknown as SB;
    const userId = context.userId;
    const motivo = data.motivo as MotivoPerda;
    const detalhe = data.observacao.trim();

    const { data: prop, error: propErr } = await sb
      .from("propostas")
      .select("id, number, status, owner_id, lead_id")
      .eq("id", data.propostaId)
      .maybeSingle();
    if (propErr) {
      await registrarFalhaSegura("propostas-perda.recusar/leitura", propErr, {
        proposta_id: data.propostaId,
      });
      throw new Error("Não foi possível carregar a proposta.");
    }
    if (!prop) throw new Error("Proposta não encontrada.");
    await assertPodeAlterarStatus(sb, userId, prop.owner_id);

    if (!(STATUS_RECUSAVEL as readonly string[]).includes(prop.status)) {
      throw new Error(
        prop.status === "recusada"
          ? "Esta proposta já está marcada como recusada."
          : "Só é possível recusar propostas em rascunho, enviadas ou aguardando aprovação.",
      );
    }

    const agora = new Date();
    const upd = await sb
      .from("propostas")
      .update({
        status: "recusada",
        motivo_recusa: motivo,
        recusa_detalhe: detalhe,
        recusada_em: agora.toISOString(),
        recusada_por: userId,
        reaberta_em: null,
      })
      .eq("id", prop.id);
    await assertNoError(upd, "propostas-perda.recusar/update", { proposta_id: prop.id });

    // Regra do lead: só perde quando não sobra nenhuma proposta viva.
    const { data: outras, error: outrasErr } = await sb
      .from("propostas")
      .select("id, status")
      .eq("lead_id", prop.lead_id)
      .neq("id", prop.id);
    if (outrasErr) {
      await registrarFalhaSegura("propostas-perda.recusar/outras", outrasErr, {
        lead_id: prop.lead_id,
      });
      throw new Error("Não foi possível conferir as outras propostas deste lead.");
    }
    const leadPerdido = leadDeveIrParaPerdido(
      (outras ?? []).map((o: { status: string }) => o.status),
    );

    if (leadPerdido) {
      const updLead = await sb
        .from("leads")
        .update({
          stage: "perdido",
          motivo_perda: motivo,
          motivo_perda_detalhe: detalhe,
          perdido_em: agora.toISOString(),
          recontatar_em: dataRecontato(motivo, agora),
        })
        .eq("id", prop.lead_id);
      await assertNoError(updLead, "propostas-perda.recusar/lead", { lead_id: prop.lead_id });
    }

    // Tarefa de recontato — idempotente por proposta (tag no título).
    const dueRecontato = dataRecontato(motivo, agora);
    if (dueRecontato) {
      const tag = `[proposta ${prop.number}]`;
      const { count } = await sb
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "retomar_contato")
        .in("status", ["pendente", "adiada"])
        .filter("title", "ilike", `%${tag}%`);
      if ((count ?? 0) === 0) {
        const insTarefa = await sb.from("tarefas").insert({
          lead_id: prop.lead_id,
          owner_id: prop.owner_id,
          title: `Retomar contato ${tag}`,
          descricao: `Proposta ${prop.number} recusada — motivo: ${motivo}. ${detalhe}`,
          tipo: "retomar_contato",
          kind: "retomar_contato",
          due_date: new Date(`${dueRecontato}T12:00:00.000Z`).toISOString(),
          status: "pendente",
          origem: "proposta_recusada",
        });
        if (insTarefa?.error) {
          // BAIXA: a recusa já está gravada; a tarefa é acessório.
          await registrarFalhaSegura("propostas-perda.recusar/tarefa", insTarefa.error, {
            proposta_id: prop.id,
          });
        }
      }
    }

    await auditar(sb, userId, "proposta_recusada", prop.status, `${prop.number} — ${motivo}`);
    return { ok: true as const, leadPerdido };
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
      const updLead = await sb
        .from("leads")
        .update({
          stage: "proposta",
          motivo_perda: null,
          motivo_perda_detalhe: null,
          perdido_em: null,
          recontatar_em: null,
        })
        .eq("id", prop.lead_id);
      await assertNoError(updLead, "propostas-perda.reabrir/lead-update", {
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
