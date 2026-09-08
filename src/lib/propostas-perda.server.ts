/**
 * Recusa de proposta — implementação de servidor reutilizável.
 *
 * A server function `recusarProposta` e o desfecho "Cliente recusou a proposta"
 * (tarefas do Xerife, Bloco 4) chamam ESTA função: uma única regra de negócio.
 */
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";
import type { MotivoPerda } from "@/lib/motivos-perda";
import { dataRecontato, leadDeveIrParaPerdido } from "@/lib/proposta-perda";

export const STATUS_RECUSAVEL = ["rascunho", "enviada", "aguardando_aprovacao"] as const;

export type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Fail-closed: dono da proposta, admin ou `propostas.alterar_status`. */
export async function assertPodeAlterarStatus(sb: SB, userId: string, ownerId: string) {
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

export async function auditarProposta(
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

export async function recusarPropostaImpl(
  sb: SB,
  userId: string,
  input: { propostaId: string; motivo: MotivoPerda; observacao: string },
): Promise<{ ok: true; leadPerdido: boolean; number: string | null }> {
  const motivo = input.motivo;
  const detalhe = input.observacao.trim();

  const { data: prop, error: propErr } = await sb
    .from("propostas")
    .select("id, number, status, owner_id, lead_id")
    .eq("id", input.propostaId)
    .maybeSingle();
  if (propErr) {
    await registrarFalhaSegura("propostas-perda.recusar/leitura", propErr, {
      proposta_id: input.propostaId,
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
  let leadPerdido = false;
  if (prop.lead_id) {
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
    leadPerdido = leadDeveIrParaPerdido((outras ?? []).map((o: { status: string }) => o.status));

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
  }

  // Tarefa de recontato — idempotente por proposta (tag no título).
  const dueRecontato = dataRecontato(motivo, agora);
  if (dueRecontato && prop.lead_id) {
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

  await auditarProposta(sb, userId, "proposta_recusada", prop.status, `${prop.number} — ${motivo}`);
  return { ok: true as const, leadPerdido, number: (prop.number as string) ?? null };
}
