import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { empresaPreferida } from "@/lib/rotulo-contato";

/** Converte YYYY-MM-DD (input date) para ISO ancorado ao meio-dia UTC,
 *  preservando o dia escolhido em qualquer TZ (evita shift para o dia anterior). */
function parseDueDateInput(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${v}T12:00:00.000Z`;
  return new Date(v).toISOString();
}


/** Lista tarefas do vendedor logado (hoje + atrasadas), ordenadas por prioridade. */
export const listMinhaAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const endOfDay = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); })();

    const { data: tarefas, error } = await supabase
      .from("tarefas")
      .select("id, lead_id, pedido_id, tipo, title, descricao, prioridade, escalonamentos, hora_sugerida, due_date, status, origem, cobranca_n, created_at")
      .eq("owner_id", userId)
      .in("status", ["pendente", "adiada"])
      .lte("due_date", endOfDay)
      .order("prioridade", { ascending: true })
      .order("due_date", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((tarefas ?? []).map((t: any) => t.lead_id).filter(Boolean)));
    let leadsById: Record<
      string,
      { company: string; contato: string | null; empresa: string | null; stage: string; whatsapp: string | null }
    > = {};
    if (leadIds.length) {
      const { data: leads, error: erroLeads } = await supabase
        .from("leads")
        .select("id, company, contact_name, cliente_id, stage, telefone_whatsapp")
        .in("id", leadIds);
      if (erroLeads) throw new Error(erroLeads.message);

      // Empresa preferida vem do cliente vinculado (razão social) — busca em lote.
      const clienteIds = Array.from(
        new Set((leads ?? []).map((l: any) => l.cliente_id).filter(Boolean)),
      );
      const clientesById: Record<string, { razao_social: string | null; nome_fantasia: string | null }> = {};
      if (clienteIds.length) {
        const { data: clientes, error: erroClientes } = await supabase
          .from("clientes")
          .select("id, razao_social, nome_fantasia")
          .in("id", clienteIds);
        if (erroClientes) throw new Error(erroClientes.message);
        for (const c of clientes ?? []) {
          clientesById[(c as any).id] = {
            razao_social: (c as any).razao_social,
            nome_fantasia: (c as any).nome_fantasia,
          };
        }
      }

      leadsById = Object.fromEntries((leads ?? []).map((l: any) => [l.id, {
        company: l.company,
        contato: l.contact_name ?? null,
        empresa: empresaPreferida(l.cliente_id ? clientesById[l.cliente_id] : null, l.company),
        stage: l.stage,
        whatsapp: l.telefone_whatsapp,
      }]));
    }
    return (tarefas ?? []).map((t: any) => ({
      ...t,
      lead: t.lead_id ? leadsById[t.lead_id] ?? null : null,
    }));
  });

const desfechoSchema = z.object({
  tipo: z.string().min(1),
  data: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  motivo: z.string().optional().nullable(),
  detalhe: z.string().trim().max(2000).optional().nullable(),
  nota: z.string().trim().max(2000).optional().nullable(),
});

export const concluirTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    nota: z.string().trim().max(2000).optional(),
    desfecho: desfechoSchema.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertNoError } = await import("@/lib/guard-erros");
    const {
      exigeDesfecho,
      validarDesfecho,
      dataRetornoParaISO,
      ddmm,
    } = await import("@/lib/tarefa-desfecho");

    const { data: tarefa, error: readErr } = await supabase
      .from("tarefas")
      .select("id, lead_id, pedido_id, tipo, origem, status, owner_id, title, descricao")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!tarefa) throw new Error("Tarefa não encontrada");
    if (tarefa.status === "concluida") return { ok: true as const, mensagem: "Tarefa já concluída." };

    const precisa = exigeDesfecho(tarefa as any);
    const nota = (data.desfecho?.nota ?? data.nota ?? "").trim();

    // ── Caminho antigo: tarefas manuais, de pedido e de pós-venda.
    if (!precisa) {
      const isPosVenda = typeof tarefa.tipo === "string" && tarefa.tipo.startsWith("pos_venda_");
      if (isPosVenda && nota.length < 10) {
        throw new Error(
          "Tarefas de pós-venda exigem nota de conclusão com pelo menos 10 caracteres descrevendo o que o cliente disse.",
        );
      }
      const up = await supabase
        .from("tarefas")
        .update({
          status: "concluida",
          nota_conclusao: nota || null,
          concluida_at: new Date().toISOString(),
          desfecho: "manual",
        })
        .eq("id", data.id);
      await assertNoError(up, "minha-agenda.concluirTarefa", { id: data.id });

      const { encerrarPedidoPorTarefa } = await import("@/lib/pedidos-fluxo.server");
      await encerrarPedidoPorTarefa(supabase, data.id);
      return { ok: true as const, mensagem: "Tarefa concluída." };
    }

    // ── Tarefa comercial do Xerife: desfecho obrigatório (fail-closed).
    const desfecho = data.desfecho;
    if (!desfecho) {
      return { ok: false as const, message: "Escolha o desfecho desta tarefa." };
    }

    const leadId = tarefa.lead_id as string;
    const { data: lead, error: erroLead } = await supabase
      .from("leads")
      .select("id, company, contact_name, stage")
      .eq("id", leadId)
      .maybeSingle();
    if (erroLead) throw new Error(erroLead.message);
    if (!lead) throw new Error("Lead da tarefa não encontrado.");

    const valid = validarDesfecho(desfecho as any, { stageAtual: lead.stage as string });
    if (!valid.ok) return { ok: false as const, message: valid.erro };

    let mensagem = "Tarefa concluída.";
    let aviso: string | undefined;
    let detalhe = (desfecho.detalhe ?? "").trim() || null;

    if (desfecho.tipo === "retorno_agendado") {
      const dataISO = dataRetornoParaISO(desfecho.data!);
      const dia = ddmm(desfecho.data!);
      const quem = (lead.contact_name || lead.company || "cliente") as string;

      const insInt = await supabase.from("lead_interactions").insert({
        lead_id: leadId,
        owner_id: userId,
        type: "note",
        content: `Contato feito · retorno combinado para ${dia}${nota ? ` — ${nota}` : ""}`,
      });
      await assertNoError(insInt, "concluirTarefa.retorno.interacao", { lead_id: leadId });

      const upLead = await supabase
        .from("leads")
        .update({ next_followup: dataISO })
        .eq("id", leadId);
      await assertNoError(upLead, "concluirTarefa.retorno.lead", { lead_id: leadId });

      const insTarefa = await supabase.from("tarefas").insert({
        lead_id: leadId,
        owner_id: userId,
        tipo: "retorno_agendado",
        kind: "retorno_agendado",
        title: `Retorno combinado: ${quem}${nota ? ` — ${nota.slice(0, 60)}` : ""}`,
        descricao: nota || `Retorno combinado para ${dia}.`,
        prioridade: 1,
        due_date: dataISO,
        status: "pendente",
        origem: "manual",
      });
      await assertNoError(insTarefa, "concluirTarefa.retorno.tarefa", { lead_id: leadId });

      // Conversa do vendedor entra em "Em espera" — não é resposta pendente.
      const { data: conv, error: erroConv } = await supabase
        .from("whatsapp_conversas")
        .select("id")
        .eq("lead_id", leadId)
        .eq("atribuido_para", userId)
        .maybeSingle();
      if (erroConv) {
        const { registrarFalhaSegura } = await import("@/lib/guard-erros");
        await registrarFalhaSegura("concluirTarefa.retorno.conversa", erroConv, { lead_id: leadId });
      } else if (conv?.id) {
        const upConv = await supabase
          .from("whatsapp_conversas")
          .update({ em_espera_desde: new Date().toISOString(), em_espera_por: userId })
          .eq("id", conv.id);
        await assertNoError(upConv, "concluirTarefa.retorno.espera", { conversa_id: conv.id });
      }

      detalhe = `Retorno combinado para ${dia}${nota ? ` — ${nota}` : ""}`;
      mensagem = `Retorno marcado para ${dia}. O Xerife não vai cobrar este lead até lá.`;
    } else if (desfecho.tipo === "avancou_etapa") {
      const novo = desfecho.stage!;
      const upLead = await supabase.from("leads").update({ stage: novo as any }).eq("id", leadId);
      await assertNoError(upLead, "concluirTarefa.avanco.lead", { lead_id: leadId, stage: novo });

      const insInt = await supabase.from("lead_interactions").insert({
        lead_id: leadId,
        owner_id: userId,
        type: "note",
        content: `Etapa avançada para ${novo} pelo desfecho da tarefa${nota ? ` — ${nota}` : ""}`,
      });
      await assertNoError(insInt, "concluirTarefa.avanco.interacao", { lead_id: leadId });

      detalhe = `Avançou para ${novo}`;
      mensagem = `Lead movido para ${novo}.`;
    } else if (desfecho.tipo === "perdido") {
      const { marcarLeadPerdidoServidor } = await import("@/lib/leads-perda.server");
      const r = await marcarLeadPerdidoServidor(supabase, {
        leadId,
        motivo: desfecho.motivo!,
        detalhe: (desfecho.detalhe ?? "").trim() || nota || null,
        ownerId: userId,
      });
      if (r.aviso) aviso = r.aviso;
      detalhe = `Perdido · ${desfecho.motivo}${detalhe ? ` — ${detalhe}` : ""}`;
      mensagem = `Lead marcado como perdido (${desfecho.motivo}).`;
    } else {
      // sem_pendencia
      mensagem = "Tarefa encerrada sem pendência.";
    }

    const up = await supabase
      .from("tarefas")
      .update({
        status: "concluida",
        concluida_at: new Date().toISOString(),
        desfecho: desfecho.tipo,
        desfecho_detalhe: detalhe,
        nota_conclusao: nota || null,
      })
      .eq("id", data.id);
    await assertNoError(up, "minha-agenda.concluirTarefa", { id: data.id });

    // Duplicatas: outras tarefas abertas do mesmo lead e tipo saem junto.
    // Sem nota → recebe o motivo como nota (o trigger de pós-venda exige nota).
    const detalheDup = `encerrada junto com a tarefa ${tarefa.title ?? data.id}`;
    for (const semNota of [true, false]) {
      let qDup = supabase
        .from("tarefas")
        .update({
          status: "concluida",
          concluida_at: new Date().toISOString(),
          desfecho: "sem_pendencia",
          desfecho_detalhe: detalheDup,
          ...(semNota ? { nota_conclusao: detalheDup } : {}),
        })
        .eq("lead_id", leadId)
        .eq("tipo", tarefa.tipo as string)
        .in("status", ["pendente", "adiada"])
        .neq("id", data.id);
      qDup = semNota ? qDup.is("nota_conclusao", null) : qDup.not("nota_conclusao", "is", null);
      const upDup = await qDup;
      await assertNoError(upDup, "concluirTarefa.duplicatas", { lead_id: leadId });
    }


    const { encerrarPedidoPorTarefa } = await import("@/lib/pedidos-fluxo.server");
    await encerrarPedidoPorTarefa(supabase, data.id);

    return { ok: true as const, mensagem, ...(aviso ? { aviso } : {}) };
  });


export const adiarTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    motivo: z.string().min(1).max(500),
    novaData: z.string().min(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Lê escalonamentos atual
    const { data: cur } = await supabase.from("tarefas").select("escalonamentos").eq("id", data.id).maybeSingle();
    const { error } = await supabase
      .from("tarefas")
      .update({
        status: "adiada",
        motivo_adiamento: data.motivo,
        due_date: parseDueDateInput(data.novaData),
        escalonamentos: ((cur?.escalonamentos as any) ?? 0) + 1,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reabre uma tarefa concluída (desmarcar). Só o dono da tarefa ou um admin —
 * gate fail-closed. Limpa o desfecho para que a próxima baixa exija um novo.
 */
export const reabrirTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertNoError } = await import("@/lib/guard-erros");

    const { data: tarefa, error: readErr } = await supabase
      .from("tarefas")
      .select("id, owner_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!tarefa) throw new Error("Tarefa não encontrada");
    if (tarefa.status !== "concluida") return { ok: true as const, mensagem: "Tarefa já está aberta." };

    let permitido = tarefa.owner_id === userId;
    if (!permitido) {
      const { data: isAdmin, error: erroRole } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (erroRole) throw new Error(erroRole.message);
      permitido = !!isAdmin;
    }
    if (!permitido) throw new Error("Só o dono da tarefa ou um admin pode reabri-la.");

    const up = await supabase
      .from("tarefas")
      .update({
        status: "pendente",
        concluida_at: null,
        desfecho: null,
        desfecho_detalhe: null,
      })
      .eq("id", data.id);
    await assertNoError(up, "minha-agenda.reabrirTarefa", { id: data.id });

    const ins = await supabase.from("user_audit_log").insert({
      ator_user_id: userId,
      alvo_user_id: userId,
      campo: `tarefa.${data.id}.status`,
      valor_anterior: "concluida",
      valor_novo: "pendente",
    });
    await assertNoError(ins, "minha-agenda.reabrirTarefa.audit", { id: data.id });

    return { ok: true as const, mensagem: "Tarefa reaberta." };
  });
