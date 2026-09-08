/**
 * Mensagem de cliente fora do horário de atendimento:
 *   (a) uma resposta automática neutra por período fora do horário;
 *   (b) tarefa `resposta_pendente` para o dono, com prazo na próxima abertura.
 *
 * Nunca responde quando a IA está atendendo (o Gabriel já responde) nem em
 * conversa encerrada. Não grava interação no lead — é automático.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deveAutoResponder,
  proximaAberturaUtil,
  textoAutoResposta,
  tituloTarefaForaHorario,
  type JanelaUtil,
} from "@/lib/fora-horario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>;

export type ResultadoForaHorario = {
  aplicado: boolean;
  respondeu: boolean;
  tarefaCriada: boolean;
  motivo?: string;
};

export async function janelaUtilConfigurada(sb: SB): Promise<JanelaUtil> {
  const { data } = await sb
    .from("xerife_config")
    .select("dias_uteis_inicio, dias_uteis_fim")
    .eq("id", 1)
    .maybeSingle();
  return {
    inicio: String(data?.dias_uteis_inicio ?? "08:00:00").slice(0, 5),
    fim: String(data?.dias_uteis_fim ?? "18:00:00").slice(0, 5),
  };
}

export async function tratarMensagemForaHorario(
  sb: SB,
  args: { conversaId: string; texto: string; now?: Date },
): Promise<ResultadoForaHorario> {
  const now = args.now ?? new Date();
  const vazio: ResultadoForaHorario = { aplicado: false, respondeu: false, tarefaCriada: false };

  const { data: conv, error } = await sb
    .from("whatsapp_conversas")
    .select(
      "id, phone, name, status, ia_ativa, atribuido_para, lead_id, auto_resposta_em, last_message_preview",
    )
    .eq("id", args.conversaId)
    .maybeSingle();
  if (error) {
    const { registrarFalhaSegura } = await import("@/lib/guard-erros");
    await registrarFalhaSegura("fora-horario/carregar-conversa", error, {
      conversa_id: args.conversaId,
    });
    return { ...vazio, motivo: "erro_conversa" };
  }
  if (!conv) return { ...vazio, motivo: "conversa_inexistente" };

  const win = await janelaUtilConfigurada(sb);
  if (!deveAutoResponder(conv, now, win)) return { ...vazio, motivo: "nao_elegivel" };

  const ownerId = conv.atribuido_para as string;
  const { data: dono } = await sb.from("profiles").select("name").eq("id", ownerId).maybeSingle();

  // (a) resposta automática — uma por período fora do horário
  let respondeu = false;
  try {
    const texto = textoAutoResposta(dono?.name ?? null, win);
    const { sendWhatsappText } = await import("@/lib/whatsapp-send.server");
    await sendWhatsappText(conv.phone as string, texto, "fora-horario", "comercial", {
      origem: "resposta_inbound",
    });
    respondeu = true;
    const up = await sb
      .from("whatsapp_conversas")
      .update({ auto_resposta_em: now.toISOString() })
      .eq("id", conv.id);
    if (up?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("fora-horario/marcar-auto-resposta", up.error, {
        conversa_id: conv.id,
      });
    }
    const ins = await sb.from("whatsapp_mensagens").insert({
      conversa_id: conv.id,
      direcao: "saida",
      autor: "ia",
      conteudo: texto,
    });
    if (ins?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("fora-horario/historico-auto-resposta", ins.error, {
        conversa_id: conv.id,
      });
    }
  } catch (e) {
    const { registrarFalhaSegura } = await import("@/lib/guard-erros");
    await registrarFalhaSegura("fora-horario/enviar-auto-resposta", e, { conversa_id: conv.id });
  }

  // (b) primeira tarefa da manhã para o dono
  let tarefaCriada = false;
  const leadId = (conv.lead_id as string | null) ?? null;
  let jaTem = false;
  if (leadId) {
    const { temTarefaAbertaOuRecente } = await import("@/lib/xerife/dedupe.server");
    jaTem = await temTarefaAbertaOuRecente(sb, leadId, "resposta_pendente", 0, win, now);
  } else {
    const { count } = await sb
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("tipo", "resposta_pendente")
      .in("status", ["pendente", "adiada"])
      .ilike("descricao", `%[conversa:${conv.id}]%`);
    jaTem = (count ?? 0) > 0;
  }

  if (!jaTem) {
    const abertura = proximaAberturaUtil(now, win);
    const quem = (conv.name as string | null)?.trim() || (conv.phone as string);
    const preview = String(conv.last_message_preview ?? args.texto ?? "").slice(0, 400);
    const insT = await sb.from("tarefas").insert({
      lead_id: leadId,
      owner_id: ownerId,
      title: tituloTarefaForaHorario(now, quem),
      descricao: `Mensagem recebida fora do horário: "${preview}"\n[conversa:${conv.id}]`,
      tipo: "resposta_pendente",
      kind: "resposta_pendente",
      prioridade: 1,
      due_date: abertura.toISOString(),
      status: "pendente",
      origem: "xerife",
    });
    if (insT?.error) {
      const { registrarFalhaSegura } = await import("@/lib/guard-erros");
      await registrarFalhaSegura("fora-horario/criar-tarefa", insT.error, {
        conversa_id: conv.id,
        owner_id: ownerId,
      });
    } else {
      tarefaCriada = true;
    }
  }

  return { aplicado: true, respondeu, tarefaCriada };
}
