/**
 * Xerife 2.0 — Engine de Cadência.
 *
 * Roda a cada 15min em dias úteis 07-20h SP (via pg_cron).
 * Cada regra:
 *   1. busca candidatos
 *   2. dedupe: xerife_log (24h) + tarefa pendente equivalente
 *   3. cria tarefa (origem='xerife', tipo, prioridade, hora_sugerida)
 *   4. loga em xerife_log
 *   5. opcionalmente notifica via Z-API
 *
 * Idempotente: rodar 2x seguidas nunca duplica.
 * Horas úteis SP: SLAs em minutos/horas são úteis, não corridos.
 * A3 pula conversas com ia_ativa=true (Lucas está atendendo).
 */
import { createFileRoute } from "@tanstack/react-router";
import { registrarFalhaSegura } from "@/lib/guard-erros";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";
import {
  subtractBusinessMinutes,
  subtractBusinessHours,
  isBusinessNow,
  type BusinessWindow,
} from "@/lib/xerife/businessTime.server";
import { alreadyActed, temTarefaAbertaOuRecente, logAction } from "@/lib/xerife/dedupe.server";
import { carenciaHorasUteis, sufixoCobranca } from "@/lib/tarefa-desfecho";
import { notifyOwner, notifyDiretoria, crmLeadLink } from "@/lib/xerife/notify.server";

// ─── Helpers de contexto para títulos de tarefas (regras gerais):
//   • sufixo sempre no fim, separado por " — "
//   • se o timestamp for nulo/invalid, devolvemos "" e o título fica sem sufixo
//   • datas em DD/MM, horas em HHhMM, arredondamento para baixo
const SP_TZ = "America/Sao_Paulo";
function _valid(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDDMM(iso: string | null | undefined): string | null {
  const d = _valid(iso);
  if (!d) return null;
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  return p;
}
function fmtHHhMM(iso: string | null | undefined): string | null {
  const d = _valid(iso);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((x) => x.type === "hour")?.value ?? "00";
  const mm = parts.find((x) => x.type === "minute")?.value ?? "00";
  return `${hh}h${mm}`;
}
function diasDesde(iso: string | null | undefined, now: Date): number | null {
  const d = _valid(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400_000));
}
function horasDesde(iso: string | null | undefined, now: Date): number | null {
  const d = _valid(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3600_000));
}
const STAGE_LABEL: Record<string, string> = {
  novo: "Novo",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};
const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  telefone: "Telefone",
  indicacao: "Indicação",
  email: "E-mail",
};
function canalLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  if (!k) return null;
  return CANAL_LABEL[k] ?? raw;
}
/** Concatena base + sufixo se o sufixo estiver preenchido; senão devolve só a base. */
function withCtx(base: string, ctx: string | null | undefined): string {
  return ctx && ctx.trim() ? `${base} — ${ctx.trim()}` : base;
}

export type XerifePlanItem = {
  regra: string;
  /** Nulo quando a ação é sobre uma conversa sem lead (A7). */
  lead_id: string | null;
  lead_company: string | null;
  owner_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string;
  motivo: string;
  prioridade: number;
  acao: "criar_tarefa" | "notificar_diretoria" | "marcar_esfriando" | "registrar_escalacao";
};

type Cfg = {
  ativo: boolean;
  sla_primeiro_contato_min: number;
  sla_primeiro_contato_escalar_min: number;
  sla_resposta_whatsapp_horas: number;
  sla_resposta_whatsapp_escalar_horas: number;
  max_dias_etapa: Record<string, number>;
  cadencia_proposta_dias: number[];
  carteira_alerta_dias: number;
  carteira_critico_dias: number;
  reciclagem_perdidos_dias: number;
  pos_venda_dias: number[];
  dias_uteis_inicio: string;
  dias_uteis_fim: string;
  auto_atribuir_lead_orfao: boolean;
  sla_lead_orfao_min: number;
  cadencia_abandono_dias: number[];
  reatribuir_lead_abandonado: boolean;
};

async function loadCfg(): Promise<Cfg> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("xerife_config").select("*").eq("id", 1).maybeSingle();
  const d: any = data ?? {};
  return {
    ativo: d.ativo ?? true,
    sla_primeiro_contato_min: d.sla_primeiro_contato_min ?? 15,
    sla_primeiro_contato_escalar_min: d.sla_primeiro_contato_escalar_min ?? 60,
    sla_resposta_whatsapp_horas: d.sla_resposta_whatsapp_horas ?? 2,
    sla_resposta_whatsapp_escalar_horas: d.sla_resposta_whatsapp_escalar_horas ?? 4,
    max_dias_etapa: d.max_dias_etapa ?? { novo: 1, qualificacao: 2, proposta: 3, negociacao: 5 },
    cadencia_proposta_dias: d.cadencia_proposta_dias ?? [2, 5, 10, 15],
    carteira_alerta_dias: d.carteira_alerta_dias ?? 45,
    carteira_critico_dias: d.carteira_critico_dias ?? 60,
    reciclagem_perdidos_dias: d.reciclagem_perdidos_dias ?? 90,
    pos_venda_dias: d.pos_venda_dias ?? [3, 15, 45],
    dias_uteis_inicio: (d.dias_uteis_inicio ?? "08:00:00").slice(0, 5),
    dias_uteis_fim: (d.dias_uteis_fim ?? "18:00:00").slice(0, 5),
    auto_atribuir_lead_orfao: d.auto_atribuir_lead_orfao ?? true,
    sla_lead_orfao_min: d.sla_lead_orfao_min ?? 15,
    cadencia_abandono_dias: d.cadencia_abandono_dias ?? [2, 5, 10],
    reatribuir_lead_abandonado: d.reatribuir_lead_abandonado ?? true,
  };
}

type Stats = Record<string, number>;

async function runEngine(opts: { force?: boolean; dryRun?: boolean } = {}): Promise<{
  ran: boolean;
  reason?: string;
  stats: Stats;
  plan: XerifePlanItem[];
  dryRun: boolean;
}> {
  const force = opts.force ?? false;
  const dryRun = opts.dryRun ?? false;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const cfg = await loadCfg();
  if (!cfg.ativo) return { ran: false, reason: "xerife inativo", stats: {}, plan: [], dryRun };

  const win: BusinessWindow = { inicio: cfg.dias_uteis_inicio, fim: cfg.dias_uteis_fim };
  if (!force && !isBusinessNow(win)) {
    return { ran: false, reason: "fora do horário útil SP", stats: {}, plan: [], dryRun };
  }

  const stats: Stats = {
    a0_lead_orfao: 0,
    a1_primeiro_contato: 0,
    a1_escalado: 0,
    a2_lead_parado: 0,
    a3_sem_resposta: 0,
    a3_escalado: 0,
    a5_espera_longa: 0,
    a4_cadencia_proposta: 0,
    b1_carteira_45: 0,
    b2_carteira_60: 0,
    b3_reciclagem: 0,
    d1_abandono: 0,
    d1_escalado: 0,
    d1_reatribuido: 0,
    a6_ia_abandonada: 0,
    a7_conversa_parada: 0,
    p1_rascunho_parado: 0,
    p1_auto_recusado: 0,
    p2_proposta_vencida: 0,

  };

  const plan: XerifePlanItem[] = [];

  // Usuários isentos de cobrança do Xerife: entram no plano (simulador), mas
  // não recebem tarefa.
  const { data: isentosRows } = await sb.from("profiles").select("id").eq("xerife_isento", true);
  const isentos = new Set<string>(((isentosRows ?? []) as Array<{ id: string }>).map((r) => r.id));

  async function criarTarefa(t: {
    lead_id: string | null;
    lead_company: string | null;
    owner_id: string | null;
    tipo: string;
    titulo: string;
    descricao: string;
    motivo: string;
    regra: string;
    prioridade: number;
    horaSugerida?: string;
    dueDate?: Date;
    proposta_id?: string | null;
  }) {
    plan.push({
      regra: t.regra,
      lead_id: t.lead_id,
      lead_company: t.lead_company,
      owner_id: t.owner_id,
      tipo: t.tipo,
      titulo: t.titulo,
      descricao: t.descricao,
      motivo: t.motivo,
      prioridade: t.prioridade,
      acao: "criar_tarefa",
    });
    if (dryRun) return;
    // Dono isento não é cobrado pelo Xerife — nada a criar.
    if (t.owner_id && isentos.has(t.owner_id)) return;
    // Numeração da cobrança: quantas vezes já cobramos este (lead, tipo) em 30 dias.
    const desde30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    let cobrancaN = 1;
    if (t.lead_id) {
      const { count: jaCobradas } = await sb
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", t.lead_id)
        .eq("tipo", t.tipo)
        .eq("status", "concluida")
        .gte("concluida_at", desde30);
      cobrancaN = (jaCobradas ?? 0) + 1;
    }
    // REGISTRAR E SEGUIR: cron; uma tarefa perdida é recriada na próxima
    // rodada, mas a falha precisa ficar visível em /falhas.
    const insTarefa = await sb.from("tarefas").insert({
      lead_id: t.lead_id,
      proposta_id: t.proposta_id ?? null,
      owner_id: t.owner_id,
      title: `${t.titulo}${sufixoCobranca(cobrancaN)}`,
      descricao: t.descricao,
      tipo: t.tipo,
      cobranca_n: cobrancaN,
      kind: t.tipo,
      prioridade: t.prioridade,
      hora_sugerida: t.horaSugerida ?? null,
      due_date: (t.dueDate ?? new Date(Date.now() + 2 * 3600 * 1000)).toISOString(),
      status: "pendente",
      origem: "xerife",
    });
    if (insTarefa?.error) {
      await registrarFalhaSegura("xerife-engine.criarTarefa", insTarefa.error, {
        regra: t.regra,
        lead_id: t.lead_id,
      });
    }
  }

  const log = async (...args: Parameters<typeof logAction>) => {
    if (dryRun) return;
    return logAction(...args);
  };
  const alertDiretoria = async (
    msg: string,
    ctx: { regra: string; lead_id: string; lead_company: string | null; owner_id: string | null },
  ) => {
    plan.push({
      regra: ctx.regra,
      lead_id: ctx.lead_id,
      lead_company: ctx.lead_company,
      owner_id: ctx.owner_id,
      tipo: "alerta_diretoria",
      titulo: "Notificar diretoria",
      descricao: msg,
      motivo: msg,
      prioridade: 0,
      acao: "notificar_diretoria",
    });
    if (dryRun) return;
    await notifyDiretoria(msg);
  };
  /**
   * Registra o evento no plano/simulador e em `xerife_log`, SEM disparar para o
   * grupo do Telegram da diretoria. Usado nas escalações A1/A3, que já geram
   * tarefa e notificação individual para o vendedor responsável.
   */
  const registrarSemDiretoria = async (
    msg: string,
    ctx: { regra: string; lead_id: string; lead_company: string | null; owner_id: string | null },
  ) => {
    plan.push({
      regra: ctx.regra,
      lead_id: ctx.lead_id,
      lead_company: ctx.lead_company,
      owner_id: ctx.owner_id,
      tipo: "escalacao",
      titulo: "Escalação registrada (sem grupo)",
      descricao: msg,
      motivo: msg,
      prioridade: 0,
      acao: "registrar_escalacao",
    });
  };
  const marcarEsfriando = async (
    leadId: string,
    company: string | null,
    ownerId: string | null,
    regra: string,
  ) => {
    plan.push({
      regra,
      lead_id: leadId,
      lead_company: company,
      owner_id: ownerId,
      tipo: "esfriando",
      titulo: "Marcar lead como esfriando",
      descricao: "Definir esfriando=true",
      motivo: "lead parado além do máximo",
      prioridade: 3,
      acao: "marcar_esfriando",
    });
    if (dryRun) return;
    // REGISTRAR E SEGUIR: marcação de "esfriando" é reavaliada a cada rodada.
    const upEsfriando = await sb.from("leads").update({ esfriando: true }).eq("id", leadId);
    if (upEsfriando?.error) {
      await registrarFalhaSegura("xerife-engine.marcarEsfriando", upEsfriando.error, {
        regra,
        lead_id: leadId,
      });
    }
  };

  /** Proposta enviada mais recente do lead — liga a tarefa de cadência a ela. */
  async function propostaAtivaDoLead(leadId: string): Promise<string | null> {
    const { data, error } = await sb
      .from("propostas")
      .select("id")
      .eq("lead_id", leadId)
      .in("status", ["enviada", "aguardando_aprovacao"])
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      await registrarFalhaSegura("xerife-engine.propostaAtivaDoLead", error, { lead_id: leadId });
      return null;
    }
    return (data?.id as string | null) ?? null;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  /** "Xerife silenciado até": retorno combinado com o cliente (leads.next_followup). */
  const silenciado = (l: { next_followup?: string | null }) =>
    !!l.next_followup && l.next_followup > nowIso;

  // ─────────────── A0: lead órfão (sem vendedor atribuído) ───────────────
  {
    const thresholdIso = subtractBusinessMinutes(cfg.sla_lead_orfao_min, win, now).toISOString();
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, created_at, stage")
      .is("owner_id", null)
      .not("stage", "in", "(ganho,perdido)")
      .lt("created_at", thresholdIso)
      .limit(500);

    for (const l of leads ?? []) {
      const regra = "A0_lead_orfao";
      if (await alreadyActed(sb, regra, l.id, 1)) continue;

      if (cfg.auto_atribuir_lead_orfao) {
        plan.push({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: null,
          tipo: "atribuir_vendedor",
          titulo: "Atribuir vendedor (round-robin)",
          descricao: `Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis — atribuir via fila.`,
          motivo: `Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis.`,
          prioridade: 1,
          acao: "criar_tarefa",
        });
        if (!dryRun) {
          const { data: newOwner, error: rpcErr } = await sb.rpc("atribuir_proximo_vendedor", {
            _lead_id: l.id,
          });
          if (rpcErr) {
            // Falha técnica: vai para "Falhas do sistema", não para o grupo.
            const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
            await registrarFalhaAdmin(
              "xerife.atribuicao",
              `Falha ao atribuir automaticamente lead órfão: ${rpcErr.message}`,
              { regra, lead_id: l.id, lead_company: l.company },
            );
          }
          await log(sb, {
            regra,
            leadId: l.id,
            vendedorId: (newOwner as string) ?? null,
            acao: rpcErr
              ? "atribuição falhou → registrada em Falhas do sistema"
              : "atribuído via round-robin",
            payload: {
              sla_min: cfg.sla_lead_orfao_min,
              created_at: l.created_at,
              auto: true,
              erro: rpcErr?.message ?? null,
            },
          });
        }
      } else {
        await alertDiretoria(
          `🟡 Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis\n\nCliente: ${l.company}\nAtribua manualmente.\n${crmLeadLink(l.id)}`,
          { regra, lead_id: l.id, lead_company: l.company, owner_id: null },
        );
        await log(sb, {
          regra,
          leadId: l.id,
          vendedorId: null,
          acao: "diretoria notificada (atribuição manual)",
          payload: { sla_min: cfg.sla_lead_orfao_min, created_at: l.created_at, auto: false },
        });
      }
      stats.a0_lead_orfao++;
    }
  }

  // ─────────────── A1: primeiro contato (SLA em min úteis) ───────────────
  {
    const thresholdIso = subtractBusinessMinutes(
      cfg.sla_primeiro_contato_min,
      win,
      now,
    ).toISOString();
    const escalarIso = subtractBusinessMinutes(
      cfg.sla_primeiro_contato_escalar_min,
      win,
      now,
    ).toISOString();

    const { data: leads } = await sb
      .from("leads")
      .select(
        "id, company, owner_id, created_at, last_contact_at, last_interaction_at, origem, source, next_followup",
      )
      .in("stage", ["novo", "qualificacao"] as any)
      .lt("created_at", thresholdIso)
      .is("last_contact_at", null)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      // ainda que trigger não tenha rodado, dupla checagem: sem last_interaction_at também
      if (l.last_interaction_at || l.last_contact_at) continue;
      if (silenciado(l)) continue;
      const regra = "A1_primeiro_contato";
      if (await alreadyActed(sb, regra, l.id, 24)) continue;
      if (await temTarefaAbertaOuRecente(sb, l.id, "primeiro_contato", carenciaHorasUteis("primeiro_contato"), win, now)) continue;

      const hora = fmtHHhMM(l.created_at);
      const canal = canalLabel((l as any).origem ?? (l as any).source);
      const ctxPc = hora
        ? canal
          ? `lead chegou às ${hora} via ${canal}`
          : `lead chegou às ${hora}`
        : null;
      await criarTarefa({
        regra,
        lead_id: l.id,
        lead_company: l.company,
        owner_id: l.owner_id,
        tipo: "primeiro_contato",
        titulo: withCtx(`Primeiro contato: ${l.company}`, ctxPc),
        descricao: `Lead entrou há mais de ${cfg.sla_primeiro_contato_min} min úteis e não teve nenhum contato.`,
        motivo: `Lead entrou há mais de ${cfg.sla_primeiro_contato_min} min úteis e não teve nenhum contato.`,
        prioridade: 1,
      });
      await log(sb, {
        regra,
        leadId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { created_at: l.created_at, sla_min: cfg.sla_primeiro_contato_min },
      });
      stats.a1_primeiro_contato++;

      // Escalar diretoria se passou do limite
      if (l.created_at && l.created_at < escalarIso) {
        const escRegra = "A1_escalado";
        if (!(await alreadyActed(sb, escRegra, l.id, 24))) {
          await registrarSemDiretoria(
            `Lead sem contato há +${cfg.sla_primeiro_contato_escalar_min}min úteis — ${l.company}`,
            { regra: escRegra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
          );
          await log(sb, {
            regra: escRegra,
            leadId: l.id,
            vendedorId: l.owner_id,
            acao: "escalação registrada (sem grupo)",
            payload: { sla_escalar_min: cfg.sla_primeiro_contato_escalar_min },
          });
          stats.a1_escalado++;
        }
      }
    }
  }

  // ─────────────── A2: lead parado na etapa ───────────────
  {
    for (const [stage, maxDias] of Object.entries(cfg.max_dias_etapa)) {
      if (!maxDias || maxDias <= 0) continue;
      const thresholdIso = new Date(now.getTime() - maxDias * 86400_000).toISOString();
      const { data: leads } = await sb
        .from("leads")
        .select("id, company, owner_id, etapa_changed_at, stage, next_followup")
        .eq("stage", stage as any)
        .lt("etapa_changed_at", thresholdIso)
        .not("owner_id", "is", null)
        .limit(500);

      for (const l of leads ?? []) {
        if (silenciado(l)) continue;
        const regra = `A2_lead_parado_${stage}`;
        if (await alreadyActed(sb, regra, l.id, 24)) continue;
        if (await temTarefaAbertaOuRecente(sb, l.id, "follow_up", carenciaHorasUteis("follow_up"), win, now)) continue;

        const diasParado = diasDesde(l.etapa_changed_at, now) ?? maxDias;
        const etapaLabel = STAGE_LABEL[stage] ?? stage;
        await criarTarefa({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: l.owner_id,
          tipo: "follow_up",
          titulo: withCtx(
            `Destravar ${l.company}`,
            `parado em ${etapaLabel} há ${diasParado} dias`,
          ),
          descricao: `Lead parado em "${stage}" há +${maxDias} dias. Ligar/definir próximo passo.`,
          motivo: `Lead parado em "${stage}" há +${maxDias} dias. Ligar/definir próximo passo.`,
          prioridade: 2,
        });
        await marcarEsfriando(l.id, l.company, l.owner_id, regra);
        await log(sb, {
          regra,
          leadId: l.id,
          vendedorId: l.owner_id,
          acao: "tarefa criada + esfriando=true",
          payload: { stage, max_dias: maxDias, etapa_changed_at: l.etapa_changed_at },
        });
        stats.a2_lead_parado++;
      }
    }
  }

  // ─────────────── A3: cliente sem resposta no WhatsApp (pula ia_ativa=true) ───────────────
  {
    const thresholdIso = subtractBusinessHours(
      cfg.sla_resposta_whatsapp_horas,
      win,
      now,
    ).toISOString();
    const escalarIso = subtractBusinessHours(
      cfg.sla_resposta_whatsapp_escalar_horas,
      win,
      now,
    ).toISOString();

    // conversas com última msg cliente recente demais NÃO qualificam;
    // buscamos leads onde ultima_msg_cliente_at é antiga o suficiente e ultima_msg_vendedor_at é anterior a ela
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, ultima_msg_cliente_at, ultima_msg_vendedor_at")
      .not("ultima_msg_cliente_at", "is", null)
      .lt("ultima_msg_cliente_at", thresholdIso)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      // vendedor já respondeu?
      if (l.ultima_msg_vendedor_at && l.ultima_msg_vendedor_at >= l.ultima_msg_cliente_at) continue;

      // CRÍTICO: pular se IA (Lucas) está ativa na conversa, ou se o atendente
      // declarou espera (aguardando algo do cliente) — nesse caso não há
      // resposta pendente do nosso lado.
      const { data: conv } = await sb
        .from("whatsapp_conversas")
        .select("ia_ativa, status, em_espera_desde")
        .eq("lead_id", l.id)
        .maybeSingle();
      if (conv?.ia_ativa === true) continue;
      if (conv?.em_espera_desde) continue;


      const regra = "A3_sem_resposta";
      if (await alreadyActed(sb, regra, l.id, 12)) continue;
      if (await temTarefaAbertaOuRecente(sb, l.id, "resposta_pendente", carenciaHorasUteis("resposta_pendente"), win, now)) continue;

      const hEspera = horasDesde(l.ultima_msg_cliente_at, now);
      await criarTarefa({
        regra,
        lead_id: l.id,
        lead_company: l.company,
        owner_id: l.owner_id,
        tipo: "resposta_pendente",
        titulo: withCtx(
          `Responder ${l.company}`,
          hEspera != null ? `cliente aguardando há ${hEspera}h` : null,
        ),
        descricao: `Cliente enviou mensagem há +${cfg.sla_resposta_whatsapp_horas}h úteis sem resposta.`,
        motivo: `Cliente enviou mensagem há +${cfg.sla_resposta_whatsapp_horas}h úteis sem resposta.`,
        prioridade: 1,
      });
      await log(sb, {
        regra,
        leadId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: {
          ultima_msg_cliente_at: l.ultima_msg_cliente_at,
          sla_h: cfg.sla_resposta_whatsapp_horas,
        },
      });
      stats.a3_sem_resposta++;

      if (l.ultima_msg_cliente_at < escalarIso) {
        const escRegra = "A3_escalado";
        if (!(await alreadyActed(sb, escRegra, l.id, 24))) {
          await registrarSemDiretoria(
            `Cliente sem resposta +${cfg.sla_resposta_whatsapp_escalar_horas}h úteis — ${l.company}`,
            { regra: escRegra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
          );
          await log(sb, {
            regra: escRegra,
            leadId: l.id,
            vendedorId: l.owner_id,
            acao: "escalação registrada (sem grupo)",
          });
          stats.a3_escalado++;
        }
      }
    }
  }

  // ─────────────── A5: atendimento em espera há tempo demais ───────────────
  // Espera é legítima, mas não pode virar esquecimento: passadas
  // HORAS_ESPERA_LONGA horas, o Xerife cobra uma posição do responsável.
  // Reaviso só depois de 24h (campo `espera_alertada_em`).
  {
    const { HORAS_ESPERA_LONGA, deveCobrarEspera } = await import("@/lib/atendimento-espera");
    const { notificarUsuario } = await import("@/lib/xerife/handoff.server");
    const { data: emEspera } = await sb
      .from("whatsapp_conversas")
      .select("id, name, phone, lead_id, atribuido_para, em_espera_desde, espera_alertada_em")
      .not("em_espera_desde", "is", null)
      .limit(300);

    for (const c of emEspera ?? []) {
      if (!c.atribuido_para) continue;
      if (
        !deveCobrarEspera(
          { em_espera_desde: c.em_espera_desde, ultimoAvisoEm: c.espera_alertada_em },
          now,
          HORAS_ESPERA_LONGA,
        )
      ) {
        continue;
      }
      const quem = c.name?.trim() || c.phone;
      const horas = horasDesde(c.em_espera_desde, now);
      if (!dryRun) {
        await notificarUsuario(sb, {
          userId: c.atribuido_para,
          tipo: "conversa_espera_longa",
          titulo: `Em espera há ${horas ?? HORAS_ESPERA_LONGA}h — ${quem}. Ainda faz sentido aguardar?`,
          conversaId: c.id,
        });
        await sb
          .from("whatsapp_conversas")
          .update({ espera_alertada_em: now.toISOString() })
          .eq("id", c.id);
      }
      if (c.lead_id) {
        await log(sb, {
          regra: "A5_espera_longa",
          leadId: c.lead_id,
          vendedorId: c.atribuido_para,
          acao: "alerta de espera longa",
          payload: { conversa_id: c.id, em_espera_desde: c.em_espera_desde },
        });
      }
      stats.a5_espera_longa = (stats.a5_espera_longa ?? 0) + 1;
    }
  }

  // ─────────────── A4: cadência de proposta enviada ───────────────

  {
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, proposta_enviada_at, stage")
      .eq("stage", "proposta" as any)
      .not("proposta_enviada_at", "is", null)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      const diasCorridos = Math.floor(
        (now.getTime() - new Date(l.proposta_enviada_at!).getTime()) / 86400_000,
      );
      const passo = cfg.cadencia_proposta_dias.find((d) => d === diasCorridos);
      if (!passo) continue;

      const regra = `A4_cadencia_D${passo}`;
      if (await alreadyActed(sb, regra, l.id, 22 * 60)) continue; // 22h — 1 por passo

      const propDDMM = fmtDDMM(l.proposta_enviada_at);
      const isDecisao = passo >= 15;
      const baseTitulo = isDecisao
        ? `Decisão D+${passo}: ${l.company}`
        : `Follow proposta D+${passo}: ${l.company}`;
      const ctxA4 = propDDMM
        ? isDecisao
          ? `sem retorno desde ${propDDMM}, retomar ou marcar perdido`
          : `proposta enviada em ${propDDMM}`
        : null;
      await criarTarefa({
        regra,
        lead_id: l.id,
        lead_company: l.company,
        owner_id: l.owner_id,
        tipo: "cadencia_proposta",
        titulo: withCtx(baseTitulo, ctxA4),
        descricao: `Proposta enviada há ${passo} dias. Cadência: ${cfg.cadencia_proposta_dias.join("/")}.`,
        motivo: `Proposta enviada há ${passo} dias. Cadência: ${cfg.cadencia_proposta_dias.join("/")}.`,
        prioridade: 2,
        proposta_id: await propostaAtivaDoLead(l.id),
      });
      await log(sb, {
        regra,
        leadId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { dias_corridos: diasCorridos, cadencia: cfg.cadencia_proposta_dias },
      });
      stats.a4_cadencia_proposta++;
    }
  }

  // ─────────────── P1/P2: proposta com prazo (Bloco 4) ───────────────
  {
    const { rascunhoParado, propostaVencida, diasVencida, validadeYmd, P1_HORAS_RASCUNHO } =
      await import("@/lib/proposta-prazo");

    /** Já existe tarefa aberta (ou recém-criada) para esta proposta e tipo? */
    async function jaCobrada(propostaId: string, tipo: string, horasCarencia: number) {
      const { count: aberta, error: e1 } = await sb
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("proposta_id", propostaId)
        .eq("tipo", tipo)
        .in("status", ["pendente", "adiada"]);
      if (e1) {
        await registrarFalhaSegura("xerife-engine.proposta.dedupe", e1, { proposta_id: propostaId });
        return true; // fail-closed: não duplica na dúvida
      }
      if ((aberta ?? 0) > 0) return true;
      if (horasCarencia > 0) {
        const desde = subtractBusinessHours(horasCarencia, win, now).toISOString();
        const { count: recente, error: e2 } = await sb
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("proposta_id", propostaId)
          .eq("tipo", tipo)
          .gte("created_at", desde);
        if (e2) {
          await registrarFalhaSegura("xerife-engine.proposta.dedupe2", e2, {
            proposta_id: propostaId,
          });
          return true;
        }
        if ((recente ?? 0) > 0) return true;
      }
      return false;
    }

    const cacheLead = new Map<string, { stage: string | null; company: string | null }>();
    async function infoDoLead(
      leadId: string | null,
    ): Promise<{ stage: string | null; company: string | null }> {
      if (!leadId) return { stage: null, company: null };
      const hit = cacheLead.get(leadId);
      if (hit) return hit;
      const { data, error } = await sb
        .from("leads")
        .select("stage, company")
        .eq("id", leadId)
        .maybeSingle();
      if (error) {
        await registrarFalhaSegura("xerife-engine.proposta.lead", error, { lead_id: leadId });
        return { stage: null, company: null };
      }
      const info = {
        stage: (data?.stage as string | null) ?? null,
        company: (data?.company as string | null) ?? null,
      };
      cacheLead.set(leadId, info);
      return info;
    }

    const comEmpresa = (base: string, company: string | null) =>
      company ? `${base} — ${company}` : base;

    /** Recusa automática de rascunho morto: update direto, sem tarefa e sem tocar no lead. */
    async function autoRecusarRascunho(
      prop: any,
      motivo: string,
      detalhe: string,
    ): Promise<void> {
      if (!dryRun) {
        const up = await sb
          .from("propostas")
          .update({
            status: "recusada",
            motivo_recusa: motivo,
            recusa_detalhe: detalhe,
            recusada_em: now.toISOString(),
          })
          .eq("id", prop.id);
        if (up?.error) {
          await registrarFalhaSegura("xerife-engine.p1.auto_recusa", up.error, {
            proposta_id: prop.id,
          });
          return;
        }
      }
      await log(sb, {
        regra: "P1_rascunho_auto_recusado",
        leadId: prop.lead_id ?? null,
        vendedorId: prop.owner_id ?? null,
        acao: "proposta recusada automaticamente",
        payload: { proposta_id: prop.id, motivo, detalhe },
      });
      stats.p1_auto_recusado++;
    }

    async function rascunhoSemItens(propostaId: string): Promise<boolean> {
      const { count, error } = await sb
        .from("proposta_itens")
        .select("id", { count: "exact", head: true })
        .eq("proposta_id", propostaId);
      if (error) {
        await registrarFalhaSegura("xerife-engine.p1.itens", error, { proposta_id: propostaId });
        return false; // fail-closed: não recusa se não sabemos
      }
      return (count ?? 0) === 0;
    }

    const limiteRascunho = subtractBusinessHours(P1_HORAS_RASCUNHO, win, now).getTime();

    // ── P1: rascunho parado
    const { data: rascunhos, error: erroRas } = await sb
      .from("propostas")
      .select("id, number, status, owner_id, lead_id, created_at, updated_at")
      .eq("status", "rascunho")
      .limit(300);
    if (erroRas) await registrarFalhaSegura("xerife-engine.p1.select", erroRas, {});

    for (const prop of (rascunhos ?? []) as any[]) {
      if (!rascunhoParado(prop, limiteRascunho)) continue;
      const { stage, company } = await infoDoLead(prop.lead_id ?? null);

      // Lead já ganho/perdido: rascunho morto → recusa automática, sem tarefa.
      if (stage === "ganho" || stage === "perdido") {
        await autoRecusarRascunho(
          prop,
          stage === "ganho" ? "Duplicidade" : "Demanda cancelada ou adiada",
          "encerrada automaticamente: lead já ganho/perdido",
        );
        continue;
      }

      // Rascunho vazio parado: nada a cobrar, encerra sozinho.
      if (await rascunhoSemItens(prop.id)) {
        await autoRecusarRascunho(
          prop,
          "Lead inválido",
          "rascunho vazio, encerrado automaticamente",
        );
        continue;
      }

      if (!dryRun && (await jaCobrada(prop.id, "proposta_rascunho_parada", carenciaHorasUteis("proposta_rascunho_parada"))))
        continue;

      const regra = "P1_rascunho_parado";
      const dias = diasDesde(prop.updated_at ?? prop.created_at, now) ?? 0;
      await criarTarefa({
        regra,
        lead_id: prop.lead_id ?? null,
        lead_company: company,
        owner_id: prop.owner_id ?? null,
        proposta_id: prop.id,
        tipo: "proposta_rascunho_parada",
        titulo: comEmpresa(
          `Rascunho parado há ${dias} dias: ${prop.number ?? ""}`.trim(),
          company,
        ),
        descricao: `A proposta ${prop.number ?? ""} está em rascunho e não foi enviada. Envie, recuse ou exclua.`,
        motivo: `rascunho parado há ${dias} dias`,
        prioridade: 2,
      });
      await log(sb, {
        regra,
        leadId: prop.lead_id ?? null,
        vendedorId: prop.owner_id ?? null,
        acao: "tarefa criada",
        payload: { proposta_id: prop.id, dias },
      });
      stats.p1_rascunho_parado++;
    }

    // ── P2: proposta vencida
    const { data: enviadas, error: erroEnv } = await sb
      .from("propostas")
      .select("id, number, status, owner_id, lead_id, sent_at, validity_days, prorrogada_ate, vencida_em, reemitida_como")
      .in("status", ["enviada", "aguardando_aprovacao"])
      .limit(300);
    if (erroEnv) await registrarFalhaSegura("xerife-engine.p2.select", erroEnv, {});

    for (const prop of (enviadas ?? []) as any[]) {
      if (prop.reemitida_como) continue; // já substituída por uma nova proposta
      if (!propostaVencida(prop, now)) continue;
      const { stage, company } = await infoDoLead(prop.lead_id ?? null);
      if (stage === "ganho" || stage === "perdido") continue;

      if (!dryRun && !prop.vencida_em) {
        const upVenc = await sb
          .from("propostas")
          .update({ vencida_em: now.toISOString() })
          .eq("id", prop.id);
        if (upVenc?.error) {
          await registrarFalhaSegura("xerife-engine.p2.marcar", upVenc.error, {
            proposta_id: prop.id,
          });
        }
      }

      if (!dryRun && (await jaCobrada(prop.id, "proposta_vencida", carenciaHorasUteis("proposta_vencida"))))
        continue;

      const regra = "P2_proposta_vencida";
      const dias = diasVencida(prop, now);
      const ate = validadeYmd(prop);
      await criarTarefa({
        regra,
        lead_id: prop.lead_id ?? null,
        lead_company: company,
        owner_id: prop.owner_id ?? null,
        proposta_id: prop.id,
        tipo: "proposta_vencida",
        titulo: comEmpresa(
          `Proposta ${prop.number ?? ""} vencida há ${dias} dias`.trim(),
          company,
        ),
        descricao: `A validade${ate ? ` (${ate})` : ""} passou. Prorrogue, reemita com preço atual ou recuse.`,
        motivo: `proposta vencida há ${dias} dias`,
        prioridade: 1,
      });
      await log(sb, {
        regra,
        leadId: prop.lead_id ?? null,
        vendedorId: prop.owner_id ?? null,
        acao: "tarefa criada",
        payload: { proposta_id: prop.id, dias_vencida: dias },
      });
      stats.p2_proposta_vencida++;
    }
  }


  // ─────────────── D1: lead ativo sem contato (régua 2/5/10 dias) ───────────────
  // Passo 1 e 2: tarefa para o vendedor. Passo 3: diretoria + devolução à fila.
  {
    const reguaOrd = [...cfg.cadencia_abandono_dias].sort((a, b) => a - b);
    const maiorPasso = reguaOrd[reguaOrd.length - 1];
    const limiteIso = new Date(now.getTime() - (reguaOrd[0] ?? 2) * 86400_000).toISOString();

    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, stage, last_contact_at, created_at, reatribuido_abandono_em, next_followup, proposta_enviada_at, cliente_id")
      .in("stage", ["novo", "atendimento", "qualificacao", "proposta", "negociacao"] as any)
      .not("owner_id", "is", null)
      .or(`last_contact_at.lt.${limiteIso},last_contact_at.is.null`)
      .limit(500);

    // Quem já está na cadência de proposta (A4) não é "abandonado": proposta
    // enviada há ≤15 dias, proposta aberta em proposta/negociação ou retorno
    // futuro já agendado. Consulta em lote — sem N+1.
    const { elegivelParaDevolucao } = await import("@/lib/lead-devolucao");
    const idsLeads = (leads ?? []).map((l) => l.id as string);
    const abertasPorLead = new Map<string, number>();
    if (idsLeads.length > 0) {
      const { data: propAbertas } = await sb
        .from("propostas")
        .select("lead_id")
        .eq("status", "enviada")
        .in("lead_id", idsLeads);
      for (const p of propAbertas ?? []) {
        const k = p.lead_id as string | null;
        if (k) abertasPorLead.set(k, (abertasPorLead.get(k) ?? 0) + 1);
      }
    }

    // A carteira é âncora: quem é dono do cliente (ou tem pedido em andamento)
    // não perde o lead para a fila — o caso sobe para o gestor. Consultas em
    // lote, sem N+1.
    const donoDaCarteira = new Set<string>();
    const comPedidoAtivo = new Set<string>();
    if (idsLeads.length > 0) {
      const idsClientes = [
        ...new Set((leads ?? []).map((l) => l.cliente_id as string | null).filter(Boolean)),
      ] as string[];
      if (idsClientes.length > 0) {
        const { data: cls, error: errCls } = await sb
          .from("clientes")
          .select("id, vendedor_id")
          .in("id", idsClientes);
        if (errCls) await registrarFalhaSegura("xerife-engine.D1.clientes", errCls, {});
        const vendPorCliente = new Map<string, string | null>();
        for (const c of cls ?? []) vendPorCliente.set(c.id as string, c.vendedor_id as string | null);
        for (const l of leads ?? []) {
          const v = l.cliente_id ? vendPorCliente.get(l.cliente_id as string) : null;
          if (v && v === l.owner_id) donoDaCarteira.add(l.id as string);
        }
      }
      const { data: peds, error: errPed } = await sb
        .from("pedidos")
        .select("lead_id, stage")
        .in("lead_id", idsLeads)
        .not("stage", "in", "(cancelado,reprovado_financeiro)");
      if (errPed) await registrarFalhaSegura("xerife-engine.D1.pedidos", errPed, {});
      for (const p of peds ?? []) if (p.lead_id) comPedidoAtivo.add(p.lead_id as string);
    }

    /** Cliente da carteira parado: cobra o gestor em vez de devolver à fila. */
    async function escalarCarteira(l: any, dias: number, motivoCurto: string) {
      const regraEsc = "D1_carteira_escalada";
      if (await alreadyActed(sb, regraEsc, l.id, 7 * 24)) return;
      const { gestoresDe } = await import("@/lib/pedidos-fluxo.server");
      const gestores = await gestoresDe(sb, [l.owner_id as string]);
      const destino = gestores[0] ?? null;
      const { data: dono } = await sb
        .from("profiles")
        .select("name")
        .eq("id", l.owner_id)
        .maybeSingle();
      const nomeDono = (dono?.name as string | null)?.trim() || "o vendedor";
      if (destino && !dryRun) {
        await criarTarefa({
          regra: regraEsc,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: destino,
          tipo: "follow_up",
          titulo: `Cliente da carteira de ${nomeDono} sem contato há ${dias} dias: ${l.company}`,
          descricao: `${motivoCurto} — o lead não volta para a fila. Cobre o responsável ou transfira o cliente.`,
          motivo: motivoCurto,
          prioridade: 1,
        });
        const insN = await sb.from("notificacoes").insert({
          user_id: destino,
          tipo: "carteira_parada",
          titulo: `Cliente da carteira de ${nomeDono} sem contato há ${dias} dias`.slice(0, 300),
          exige_aceite: false,
        });
        if (insN?.error)
          await registrarFalhaSegura("xerife-engine.D1.escala", insN.error, { lead_id: l.id });
      }
      await log(sb, {
        regra: regraEsc,
        leadId: l.id,
        vendedorId: l.owner_id,
        acao: destino ? "escalado ao gestor" : "sem gestor para escalar",
        payload: { dias, motivo: motivoCurto },
      });
    }

    for (const l of leads ?? []) {
      if (silenciado(l)) continue;
      const ctxCart = {
        donoDaCarteira: donoDaCarteira.has(l.id as string),
        temPedidoAtivo: comPedidoAtivo.has(l.id as string),
      };
      if (
        !elegivelParaDevolucao(
          l as any,
          abertasPorLead.get(l.id as string) ?? 0,
          now,
          ctxCart,
        )
      ) {
        if (ctxCart.donoDaCarteira || ctxCart.temPedidoAtivo) {
          const diasSem = diasDesde(l.last_contact_at ?? l.created_at, now);
          if (diasSem != null && diasSem >= (reguaOrd[reguaOrd.length - 1] ?? 10)) {
            await escalarCarteira(
              l,
              diasSem,
              ctxCart.temPedidoAtivo
                ? "Cliente com pedido em andamento e sem contato"
                : "Cliente da própria carteira sem contato",
            );
          }
        }
        continue;
      }
      const ref = l.last_contact_at ?? l.created_at;
      const dias = diasDesde(ref, now);
      if (dias == null) continue;

      // último passo da régua já atingido pelo lead
      const passo = [...reguaOrd].reverse().find((d) => dias >= d);
      if (passo == null) continue;

      const ultimo = passo === maiorPasso;
      const regra = `D1_abandono_D${passo}`;
      if (await alreadyActed(sb, regra, l.id, 22 * 60)) continue;

      if (!ultimo) {
        if (await temTarefaAbertaOuRecente(sb, l.id, "retomar_contato", carenciaHorasUteis("retomar_contato"), win, now)) continue;
        await criarTarefa({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: l.owner_id,
          tipo: "retomar_contato",
          titulo: withCtx(`Retomar contato: ${l.company}`, `${dias} dias sem contato`),
          descricao: `Lead em ${STAGE_LABEL[l.stage as string] ?? l.stage} há ${dias} dias sem nenhum contato registrado. Régua ${reguaOrd.join("/")} dias.`,
          motivo: `Lead sem contato há ${dias} dias (régua ${reguaOrd.join("/")}).`,
          prioridade: 1,
        });
        await log(sb, {
          regra,
          leadId: l.id,
          vendedorId: l.owner_id,
          acao: "tarefa criada",
          payload: { dias, regua: reguaOrd },
        });
        stats.d1_abandono++;
        continue;
      }

      // Passo final: diretoria sempre; devolução à fila se habilitada
      await alertDiretoria(
        `🚨 Lead abandonado há ${dias} dias\n\nCliente: ${l.company}\nEtapa: ${STAGE_LABEL[l.stage as string] ?? l.stage}\n${crmLeadLink(l.id)}`,
        { regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
      );
      stats.d1_escalado++;

      if (cfg.reatribuir_lead_abandonado && !l.reatribuido_abandono_em) {
        // Aviso prévio de 24h: ninguém perde o cliente sem ser avisado.
        const { decidirDevolucao, textoAvisoDevolucao } = await import("@/lib/lead-devolucao");
        const { gestoresDe } = await import("@/lib/pedidos-fluxo.server");
        const regraAviso = "D1_aviso_devolucao";
        const decisao = decidirDevolucao(
          await alreadyActed(sb, regraAviso, l.id, 48),
          await alreadyActed(sb, regraAviso, l.id, 24),
        );
        if (decisao !== "devolver") {
          if (decisao === "avisar" && !dryRun) {
            const texto = textoAvisoDevolucao(l.company);
            const destinos = [l.owner_id as string, ...(await gestoresDe(sb, [l.owner_id as string]))]
              .filter((d, i, arr) => d && arr.indexOf(d) === i);
            const insAviso = await sb.from("notificacoes").insert(
              destinos.map((d) => ({
                user_id: d,
                tipo: "lead_sera_devolvido",
                titulo: texto.slice(0, 300),
                exige_aceite: d === l.owner_id,
              })),
            );
            if (insAviso?.error)
              await registrarFalhaSegura("xerife-engine.D1.aviso", insAviso.error, { lead_id: l.id });
            await notifyOwner(l.owner_id as string, `⚠️ *${texto}*\n${crmLeadLink(l.id)}`);
            await log(sb, {
              regra: regraAviso,
              leadId: l.id,
              vendedorId: l.owner_id,
              acao: "aviso de devolução enviado",
              payload: { dias, avisado_em: now.toISOString() },
            });
          }
          continue;
        }
        plan.push({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: l.owner_id,
          tipo: "reatribuicao",
          titulo: "Devolver lead para a fila",
          descricao: `Lead abandonado há ${dias} dias — round-robin`,
          motivo: `3º alerta ignorado`,
          prioridade: 0,
          acao: "criar_tarefa",
        });
        if (!dryRun) {
          const anterior = l.owner_id;
          await sb.from("leads").update({ owner_id: null }).eq("id", l.id);
          const { data: novoDono, error: rpcErr } = await sb.rpc("atribuir_proximo_vendedor", {
            _lead_id: l.id,
          });
          if (rpcErr) {
            await sb.from("leads").update({ owner_id: anterior }).eq("id", l.id);
          } else if ((novoDono as string | null) === anterior) {
            // Fila devolveu ao mesmo dono: efeito nulo. Escala em vez de fingir.
            await sb
              .from("leads")
              .update({ reatribuido_abandono_em: now.toISOString() })
              .eq("id", l.id);
            await log(sb, {
              regra,
              leadId: l.id,
              vendedorId: anterior,
              acao: "fila devolveu ao mesmo dono",
              payload: { dias },
            });
            await escalarCarteira(l, dias, "A fila devolveu o lead ao mesmo responsável");
          } else {
            await sb
              .from("leads")
              .update({ reatribuido_abandono_em: now.toISOString() })
              .eq("id", l.id);
            stats.d1_reatribuido++;
          }
          if ((novoDono as string | null) !== anterior) {
            await log(sb, {
              regra,
              leadId: l.id,
              vendedorId: anterior,
              acao: rpcErr ? "reatribuição falhou" : "lead devolvido à fila",
              payload: { dias, novo_owner: novoDono ?? null, erro: rpcErr?.message ?? null },
            });
          }
        }
      } else {
        await log(sb, {
          regra,
          leadId: l.id,
          vendedorId: l.owner_id,
          acao: "diretoria notificada",
          payload: { dias, reatribuicao: false },
        });
      }
    }
  }

  // ─────────────── B1: carteira 45+ dias sem contato (alerta) ───────────────
  {
    const iso45 = new Date(now.getTime() - cfg.carteira_alerta_dias * 86400_000).toISOString();
    const iso60 = new Date(now.getTime() - cfg.carteira_critico_dias * 86400_000).toISOString();
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, last_contact_at, next_followup")
      .eq("stage", "ganho" as any)
      .not("owner_id", "is", null)
      .lt("last_contact_at", iso45)
      .gte("last_contact_at", iso60)
      .limit(500);

    for (const l of leads ?? []) {
      if (silenciado(l)) continue;
      const regra = "B1_carteira_45";
      if (await alreadyActed(sb, regra, l.id, 7 * 24)) continue;
      if (await temTarefaAbertaOuRecente(sb, l.id, "resgate_carteira", carenciaHorasUteis("resgate_carteira"), win, now)) continue;

      const diasSem45 = diasDesde(l.last_contact_at, now);
      await criarTarefa({
        regra,
        lead_id: l.id,
        lead_company: l.company,
        owner_id: l.owner_id,
        tipo: "resgate_carteira",
        titulo: withCtx(
          `Resgatar ${l.company}`,
          diasSem45 != null ? `sem contato há ${diasSem45} dias` : null,
        ),
        descricao: `Cliente ganho sem contato há +${cfg.carteira_alerta_dias} dias.`,
        motivo: `Cliente ganho sem contato há +${cfg.carteira_alerta_dias} dias.`,
        prioridade: 3,
      });
      await log(sb, {
        regra,
        leadId: l.id,
        clienteId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { last_contact_at: l.last_contact_at },
      });
      stats.b1_carteira_45++;
    }
  }

  // ─────────────── B2: carteira 60+ dias (crítico + notifica diretoria) ───────────────
  {
    const iso60 = new Date(now.getTime() - cfg.carteira_critico_dias * 86400_000).toISOString();
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, last_contact_at, next_followup")
      .eq("stage", "ganho" as any)
      .not("owner_id", "is", null)
      .lt("last_contact_at", iso60)
      .limit(500);

    for (const l of leads ?? []) {
      if (silenciado(l)) continue;
      const regra = "B2_carteira_60";
      if (await alreadyActed(sb, regra, l.id, 7 * 24)) continue;

      if (!(await temTarefaAbertaOuRecente(sb, l.id, "resgate_carteira", carenciaHorasUteis("resgate_carteira"), win, now))) {
        const diasSem60 = diasDesde(l.last_contact_at, now);
        await criarTarefa({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: l.owner_id,
          tipo: "resgate_carteira",
          titulo: withCtx(
            `Resgatar ${l.company}`,
            diasSem60 != null ? `sem contato há ${diasSem60} dias` : null,
          ),
          descricao: `Cliente ganho sem contato há +${cfg.carteira_critico_dias} dias (crítico).`,
          motivo: `Cliente ganho sem contato há +${cfg.carteira_critico_dias} dias (crítico).`,
          prioridade: 1,
        });
      }
      await alertDiretoria(
        `🔴 Cliente ganho abandonado +${cfg.carteira_critico_dias}d\n\n${l.company}\n${crmLeadLink(l.id)}`,
        { regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
      );
      await log(sb, {
        regra,
        leadId: l.id,
        clienteId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa + diretoria",
        payload: { last_contact_at: l.last_contact_at },
      });
      stats.b2_carteira_60++;
    }
  }

  // ─────────────── B3: reciclagem de leads perdidos 90+ dias ───────────────
  {
    const isoLim = new Date(now.getTime() - cfg.reciclagem_perdidos_dias * 86400_000).toISOString();
    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, updated_at, etapa_changed_at, next_followup")
      .eq("stage", "perdido" as any)
      .lt("updated_at", isoLim)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      if (silenciado(l)) continue;
      const regra = "B3_reciclagem";
      if (await alreadyActed(sb, regra, l.id, 30 * 24)) continue;
      if (await temTarefaAbertaOuRecente(sb, l.id, "reativacao_lead", carenciaHorasUteis("reativacao_lead"), win, now)) continue;

      const diasPerdido = diasDesde((l as any).etapa_changed_at ?? l.updated_at, now);
      await criarTarefa({
        regra,
        lead_id: l.id,
        lead_company: l.company,
        owner_id: l.owner_id,
        tipo: "reativacao_lead",
        titulo: withCtx(
          `Reativar ${l.company}`,
          diasPerdido != null ? `perdido há ${diasPerdido}+ dias` : null,
        ),
        descricao: `Perdido há +${cfg.reciclagem_perdidos_dias} dias. Vale nova tentativa.`,
        motivo: `Perdido há +${cfg.reciclagem_perdidos_dias} dias. Vale nova tentativa.`,
        prioridade: 4,
      });
      await log(sb, {
        regra,
        leadId: l.id,
        vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { updated_at: l.updated_at },
      });
      stats.b3_reciclagem++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A6 — Conversa abandonada com a IA: cria lead se faltar, garante dono e
  // cobra o vendedor com uma tarefa "retomar_contato".
  // A7 — Conversa humana parada: cobra desfecho do responsável.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const {
      conversaAbandonadaPelaIA,
      conversaHumanaParada,
      janelaA6,
      diasParada,
      horasParada,
      tagConversa,
    } = await import("@/lib/conversas-regras");
    const agora = new Date();

    const { data: convsIA, error: erroIA } = await sb
      .from("whatsapp_conversas")
      .select("id, phone, name, status, ia_ativa, lead_id, atribuido_para, last_message_at")
      .in("status", ["ia_atendendo", "aguardando_humano"])
      .eq("ia_ativa", true)
      .order("last_message_at", { ascending: true })
      .limit(100);
    if (erroIA) {
      await registrarFalhaSegura("xerife-engine.a6.select", erroIA, {});
    }

    for (const conv of ((convsIA ?? []) as any[]).filter((c) =>
      conversaAbandonadaPelaIA(c, agora, win),
    )) {
      const regra = "a6_ia_abandonada";
      const quem = (conv.name as string | null)?.trim() || (conv.phone as string);
      if (await alreadyActed(sb, regra, conv.lead_id ?? null, 24)) continue;

      let leadId: string | null = conv.lead_id ?? null;
      let ownerId: string | null = conv.atribuido_para ?? null;

      if (!dryRun) {
        if (!leadId) {
          const { leadExistenteDaCarteira } = await import("@/lib/carteira.server");
          leadId = await leadExistenteDaCarteira(sb, conv.phone as string);
        }
        if (!leadId) {
          const ins = await sb
            .from("leads")
            .insert({
              owner_id: null,
              company: quem,
              contact_name: (conv.name as string | null)?.trim() || "A identificar",
              phone: conv.phone,
              telefone_whatsapp: conv.phone,
              stage: "novo",
              origem: "whatsapp",
              source: "WhatsApp IA abandonada",
              tags: ["WhatsApp"],
              notes: `Conversa parada com a IA há +${janelaA6(conv.status)}h úteis.`,
            })
            .select("id")
            .single();
          if (ins.error || !ins.data) {
            await registrarFalhaSegura("xerife-engine.a6.lead", ins.error, {
              conversa_id: conv.id,
            });
            continue;
          }
          leadId = ins.data.id as string;
          const upConv = await sb
            .from("whatsapp_conversas")
            .update({ lead_id: leadId })
            .eq("id", conv.id);
          if (upConv.error) {
            await registrarFalhaSegura("xerife-engine.a6.vincular", upConv.error, {
              conversa_id: conv.id,
            });
          }
        }
        if (!ownerId && leadId) {
          const { data: rpcData, error: rpcErr } = await sb.rpc("atribuir_proximo_vendedor", {
            _lead_id: leadId,
          });
          if (rpcErr) {
            await registrarFalhaSegura("xerife-engine.a6.fila", rpcErr, { lead_id: leadId });
          } else {
            ownerId = (rpcData as string) ?? null;
          }
        }
      }

      if (!dryRun && leadId && (await temTarefaAbertaOuRecente(sb, leadId, "retomar_contato", carenciaHorasUteis("retomar_contato"), win, agora)))
        continue;

      await criarTarefa({
        lead_id: leadId,
        lead_company: quem,
        owner_id: ownerId,
        tipo: "retomar_contato",
        titulo: `Retomar conversa com ${quem} — parada há ${horasParada(conv.last_message_at, agora)}h`,
        descricao: `A IA ficou com a conversa e ela parou. Assuma o atendimento. ${tagConversa(conv.id)}`,
        motivo: "conversa abandonada com a IA",
        regra,
        prioridade: 1,
      });
      if (!dryRun && ownerId) {
        await notifyOwner(
          ownerId,
          `🤖 Conversa parada com a IA

Cliente: ${quem}
Assuma o atendimento.${
            leadId ? `
${crmLeadLink(leadId)}` : ""
          }`,
        );
      }
      await log(sb, {
        regra,
        leadId,
        vendedorId: ownerId,
        acao: "tarefa criada",
        payload: { conversa_id: conv.id, last_message_at: conv.last_message_at },
      });
      stats.a6_ia_abandonada++;
    }

    // ── A7
    const { data: convsHumanas, error: erroH } = await sb
      .from("whatsapp_conversas")
      .select("id, phone, name, status, lead_id, atribuido_para, em_espera_desde, last_message_at")
      .eq("status", "humano_atendendo")
      .not("atribuido_para", "is", null)
      .is("em_espera_desde", null)
      .order("last_message_at", { ascending: true })
      .limit(100);
    if (erroH) {
      await registrarFalhaSegura("xerife-engine.a7.select", erroH, {});
    }

    for (const conv of (convsHumanas ?? []) as any[]) {
      let lead: { stage: string | null; next_followup: string | null; company: string | null } | null =
        null;
      if (conv.lead_id) {
        const { data: l, error: erroL } = await sb
          .from("leads")
          .select("stage, next_followup, company")
          .eq("id", conv.lead_id)
          .maybeSingle();
        if (erroL) {
          await registrarFalhaSegura("xerife-engine.a7.lead", erroL, { conversa_id: conv.id });
          continue;
        }
        lead = (l as any) ?? null;
      }
      if (!conversaHumanaParada(conv, lead, agora, win)) continue;

      const regra = "a7_conversa_parada";
      const quem = lead?.company || (conv.name as string | null)?.trim() || (conv.phone as string);

      // Dedupe por conversa: já cobramos esta conversa nas últimas 24h?
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count: jaCobrada } = await sb
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "conversa_parada")
        .in("status", ["pendente", "adiada"])
        .ilike("descricao", `%${tagConversa(conv.id)}%`);
      const { count: recente } = await sb
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "conversa_parada")
        .gte("created_at", desde)
        .ilike("descricao", `%${tagConversa(conv.id)}%`);
      if ((jaCobrada ?? 0) > 0 || (recente ?? 0) > 0) continue;

      await criarTarefa({
        lead_id: conv.lead_id ?? null,
        lead_company: quem,
        owner_id: conv.atribuido_para,
        tipo: "conversa_parada",
        titulo: `Conversa parada há ${diasParada(conv.last_message_at, agora)} dias — ${quem}`,
        descricao: `Ninguém encerrou, colocou em espera nem combinou retorno. Dê o próximo passo. ${tagConversa(conv.id)}`,
        motivo: "conversa humana sem próximo ato",
        regra,
        prioridade: 2,
      });
      if (!dryRun && conv.atribuido_para) {
        await notifyOwner(
          conv.atribuido_para,
          `⏳ Conversa parada

Cliente: ${quem}
Sem próximo ato há ${diasParada(conv.last_message_at, agora)} dias.${
            conv.lead_id ? `
${crmLeadLink(conv.lead_id)}` : ""
          }`,
        );
      }
      await log(sb, {
        regra,
        leadId: conv.lead_id ?? null,
        vendedorId: conv.atribuido_para,
        acao: "tarefa criada",
        payload: { conversa_id: conv.id, last_message_at: conv.last_message_at },
      });
      stats.a7_conversa_parada++;
    }
  }

  // Bloco C removido: pós-venda por PEDIDO é criado uma única vez pelo fluxo
  // operacional (`pos_venda_pedido`). Um motor por assunto — o comercial não
  // duplica mais a mesma cobrança por lead.
  // A régua D+30/45/90 a partir do encerramento do pedido entra no Bloco 5.

  /* ─────────── E1: escalação para cima (tarefas vencidas há 2+ dias úteis) ─────────── */
  stats["e1_escalado"] = 0;
  stats["e2_aceite_sem_canal"] = 0;
  try {
    // "Vencida" = 2+ ROLAGENS do fechamento (o due_date é empurrado todo dia).
    const { vencidaHa } = await import("@/lib/tarefa-vencimento");
    const limiteIso = new Date(now.getTime() - 2 * 86400_000).toISOString();
    const { data: vencidas, error: errVenc } = await sb
      .from("tarefas")
      .select("id, owner_id, tipo, due_date, escalonamentos, status")
      .in("status", ["pendente", "adiada"])
      .or(`escalonamentos.gte.2,due_date.lt.${limiteIso}`)
      .not("owner_id", "is", null);
    if (errVenc) await registrarFalhaSegura("xerife-engine.E1.tarefas", errVenc);

    const porDono = new Map<string, Map<string, number>>();
    for (const t of (vencidas ?? []) as Array<{
      owner_id: string;
      tipo: string | null;
      due_date: string | null;
      escalonamentos: number | null;
    }>) {
      if (!vencidaHa(t, 2, now)) continue;
      const m = porDono.get(t.owner_id) ?? new Map<string, number>();
      const tipo = t.tipo ?? "tarefa";
      m.set(tipo, (m.get(tipo) ?? 0) + 1);
      porDono.set(t.owner_id, m);
    }

    if (porDono.size > 0) {
      const ids = [...porDono.keys()];
      const { data: perfis } = await sb
        .from("profiles")
        .select("id, name, gestor_id, ativo, deleted_at")
        .in("id", ids);
      const perfilPorId = new Map<string, any>(
        ((perfis ?? []) as any[]).map((p) => [p.id as string, p]),
      );

      let admins: string[] | null = null;
      const { usuariosComPermissao } = await import("@/lib/pedidos-fluxo.server");

      for (const [uid, tipos] of porDono) {
        const perfil = perfilPorId.get(uid);
        if (!perfil || perfil.ativo === false || perfil.deleted_at) continue;
        const regra = `E1_vencidas:${uid}`;
        if (await alreadyActed(sb, regra, null, 22)) continue;

        const total = [...tipos.values()].reduce((a, b) => a + b, 0);
        const detalhe = [...tipos.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tipo, n]) => `${n} ${tipo.replace(/_/g, " ")}`)
          .join(", ");
        const nome = perfil.name ?? "vendedor";
        const texto = `${nome}: ${detalhe} (${total} vencidas há 2+ dias úteis) — /equipe?u=${uid}`;

        let destinos: string[] = [];
        if (perfil.gestor_id) destinos = [perfil.gestor_id as string];
        else {
          if (admins === null) admins = await usuariosComPermissao(sb, "usuarios.gerenciar");
          destinos = admins ?? [];
        }
        destinos = [...new Set(destinos)].filter((d) => d && d !== uid);
        if (destinos.length === 0) continue;

        if (!dryRun) {
          const ins = await sb.from("notificacoes").insert(
            destinos.map((d) => ({
              user_id: d,
              tipo: "tarefas_vencidas_escalado",
              titulo: texto,
              exige_aceite: false,
            })),
          );
          if (ins?.error)
            await registrarFalhaSegura("xerife-engine.E1.notificacao", ins.error, { owner_id: uid });
          if (perfil.gestor_id)
            await notifyOwner(perfil.gestor_id as string, `⏰ *Tarefas vencidas*\n${texto}`);
          await logAction(sb, {
            regra,
            acao: "escalado",
            payload: { user_id: uid, total },
          });
        }
        plan.push({
          regra: "E1",
          lead_id: null,
          lead_company: null,
          owner_id: uid,
          tipo: "escalacao",
          titulo: texto,
          descricao: `Ver painel: /equipe?u=${uid}`,
          motivo: "tarefas vencidas há 2+ dias úteis",
          prioridade: 1,
          acao: "registrar_escalacao",
        });
        stats["e1_escalado"] = (stats["e1_escalado"] ?? 0) + 1;
      }
    }
  } catch (e) {
    await registrarFalhaSegura("xerife-engine.E1", e);
  }

  /* ─────────── E2: aceites pendentes sem canal ─────────── */
  try {
    const limiteAceite = subtractBusinessHours(4, win, new Date()).toISOString();
    const { data: pend, error: errAceite } = await sb
      .from("notificacoes")
      .select("id, user_id, titulo, created_at")
      .eq("exige_aceite", true)
      .is("aceito_em", null)
      .lt("created_at", limiteAceite);
    if (errAceite) await registrarFalhaSegura("xerife-engine.E2.notificacoes", errAceite);

    const porUsuario = new Map<string, number>();
    for (const n of (pend ?? []) as Array<{ user_id: string }>) {
      if (!n.user_id) continue;
      porUsuario.set(n.user_id, (porUsuario.get(n.user_id) ?? 0) + 1);
    }

    if (porUsuario.size > 0 && !dryRun) {
      const { data: perfis } = await sb
        .from("profiles")
        .select("id, name, telegram_chat_id")
        .in("id", [...porUsuario.keys()]);
      const perfilPorId = new Map<string, any>(
        ((perfis ?? []) as any[]).map((p) => [p.id as string, p]),
      );
      const semCanal: string[] = [];

      for (const [uid, n] of porUsuario) {
        const regra = `E2_aceite:${uid}`;
        if (await alreadyActed(sb, regra, null, 22)) continue;
        const perfil = perfilPorId.get(uid);
        const nome = perfil?.name ?? "usuário";
        await notifyOwner(
          uid,
          `📌 Você tem *${n}* aviso(s) aguardando aceite no CRM. Abra o sino e confirme.`,
        );
        if (!perfil?.telegram_chat_id)
          semCanal.push(`${nome} tem ${n} avisos aguardando aceite (sem Telegram vinculado)`);
        await logAction(sb, { regra, acao: "reenviado", payload: { user_id: uid, pendentes: n } });
        stats["e2_aceite_sem_canal"] = (stats["e2_aceite_sem_canal"] ?? 0) + 1;
      }

      if (semCanal.length && !(await alreadyActed(sb, "E2_admins", null, 22))) {
        const { usuariosComPermissao } = await import("@/lib/pedidos-fluxo.server");
        const admins = await usuariosComPermissao(sb, "usuarios.gerenciar");
        if (admins?.length) {
          const titulo = semCanal.join(" · ");
          const ins = await sb.from("notificacoes").insert(
            admins.map((d: string) => ({
              user_id: d,
              tipo: "aceites_sem_canal",
              titulo: titulo.slice(0, 300),
              exige_aceite: false,
            })),
          );
          if (ins?.error) await registrarFalhaSegura("xerife-engine.E2.admins", ins.error);
          await notifyDiretoria(`⚠️ *Avisos sem aceite*\n${semCanal.join("\n")}`);
          await logAction(sb, { regra: "E2_admins", acao: "avisado", payload: { n: semCanal.length } });
        }
      }
    }
  } catch (e) {
    await registrarFalhaSegura("xerife-engine.E2", e);
  }

  return { ran: true, stats, plan, dryRun };
}

export const Route = createFileRoute("/api/public/hooks/xerife-engine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireXerifeCronAuth(request);
        if (denied) return denied;
        try {
          const result = await runEngine({ force: false, dryRun: false });
          return cronJsonResponse(result);
        } catch (e) {
          console.error("[xerife-engine] error:", e);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

export { runEngine as runXerifeEngine };
