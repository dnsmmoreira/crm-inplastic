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
import { alreadyActed, hasOpenTask, logAction } from "@/lib/xerife/dedupe.server";
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
  lead_id: string;
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
    c_pos_venda: 0,
    d1_abandono: 0,
    d1_escalado: 0,
    d1_reatribuido: 0,
  };

  const plan: XerifePlanItem[] = [];

  // Usuários isentos de cobrança do Xerife: entram no plano (simulador), mas
  // não recebem tarefa.
  const { data: isentosRows } = await sb.from("profiles").select("id").eq("xerife_isento", true);
  const isentos = new Set<string>(((isentosRows ?? []) as Array<{ id: string }>).map((r) => r.id));

  async function criarTarefa(t: {
    lead_id: string;
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
    // REGISTRAR E SEGUIR: cron; uma tarefa perdida é recriada na próxima
    // rodada, mas a falha precisa ficar visível em /falhas.
    const insTarefa = await sb.from("tarefas").insert({
      lead_id: t.lead_id,
      owner_id: t.owner_id,
      title: t.titulo,
      descricao: t.descricao,
      tipo: t.tipo,
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

  const now = new Date();

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
        "id, company, owner_id, created_at, last_contact_at, last_interaction_at, origem, source",
      )
      .in("stage", ["novo", "qualificacao"] as any)
      .lt("created_at", thresholdIso)
      .is("last_contact_at", null)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      // ainda que trigger não tenha rodado, dupla checagem: sem last_interaction_at também
      if (l.last_interaction_at || l.last_contact_at) continue;
      const regra = "A1_primeiro_contato";
      if (await alreadyActed(sb, regra, l.id, 24)) continue;
      if (await hasOpenTask(sb, l.id, "primeiro_contato")) continue;

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
        .select("id, company, owner_id, etapa_changed_at, stage")
        .eq("stage", stage as any)
        .lt("etapa_changed_at", thresholdIso)
        .not("owner_id", "is", null)
        .limit(500);

      for (const l of leads ?? []) {
        const regra = `A2_lead_parado_${stage}`;
        if (await alreadyActed(sb, regra, l.id, 24)) continue;
        if (await hasOpenTask(sb, l.id, "follow_up")) continue;

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
      if (await hasOpenTask(sb, l.id, "resposta_pendente")) continue;

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

  // ─────────────── D1: lead ativo sem contato (régua 2/5/10 dias) ───────────────
  // Passo 1 e 2: tarefa para o vendedor. Passo 3: diretoria + devolução à fila.
  {
    const reguaOrd = [...cfg.cadencia_abandono_dias].sort((a, b) => a - b);
    const maiorPasso = reguaOrd[reguaOrd.length - 1];
    const limiteIso = new Date(now.getTime() - (reguaOrd[0] ?? 2) * 86400_000).toISOString();

    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, stage, last_contact_at, created_at, reatribuido_abandono_em")
      .in("stage", ["novo", "atendimento", "qualificacao", "proposta", "negociacao"] as any)
      .not("owner_id", "is", null)
      .or(`last_contact_at.lt.${limiteIso},last_contact_at.is.null`)
      .limit(500);

    for (const l of leads ?? []) {
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
        if (await hasOpenTask(sb, l.id, "retomar_contato")) continue;
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
          } else {
            await sb
              .from("leads")
              .update({ reatribuido_abandono_em: now.toISOString() })
              .eq("id", l.id);
            stats.d1_reatribuido++;
          }
          await log(sb, {
            regra,
            leadId: l.id,
            vendedorId: anterior,
            acao: rpcErr ? "reatribuição falhou" : "lead devolvido à fila",
            payload: { dias, novo_owner: novoDono ?? null, erro: rpcErr?.message ?? null },
          });
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
      .select("id, company, owner_id, last_contact_at")
      .eq("stage", "ganho" as any)
      .not("owner_id", "is", null)
      .lt("last_contact_at", iso45)
      .gte("last_contact_at", iso60)
      .limit(500);

    for (const l of leads ?? []) {
      const regra = "B1_carteira_45";
      if (await alreadyActed(sb, regra, l.id, 7 * 24)) continue;
      if (await hasOpenTask(sb, l.id, "resgate_carteira")) continue;

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
      .select("id, company, owner_id, last_contact_at")
      .eq("stage", "ganho" as any)
      .not("owner_id", "is", null)
      .lt("last_contact_at", iso60)
      .limit(500);

    for (const l of leads ?? []) {
      const regra = "B2_carteira_60";
      if (await alreadyActed(sb, regra, l.id, 7 * 24)) continue;

      if (!(await hasOpenTask(sb, l.id, "resgate_carteira"))) {
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
      .select("id, company, owner_id, updated_at, etapa_changed_at")
      .eq("stage", "perdido" as any)
      .lt("updated_at", isoLim)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      const regra = "B3_reciclagem";
      if (await alreadyActed(sb, regra, l.id, 30 * 24)) continue;
      if (await hasOpenTask(sb, l.id, "reativacao_lead")) continue;

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

  // ─────────────── C: pós-venda D+N (pos_venda_dias, default 3/15/45) ───────────────
  {
    for (const d of cfg.pos_venda_dias) {
      const alvoInicio = new Date(now.getTime() - (d + 1) * 86400_000).toISOString();
      const alvoFim = new Date(now.getTime() - d * 86400_000).toISOString();
      const { data: leads } = await sb
        .from("leads")
        .select("id, company, owner_id, etapa_changed_at")
        .eq("stage", "ganho" as any)
        .gte("etapa_changed_at", alvoInicio)
        .lt("etapa_changed_at", alvoFim)
        .not("owner_id", "is", null)
        .limit(500);

      const tipo =
        d <= 5 ? "pos_venda_confirmacao" : d <= 20 ? "pos_venda_satisfacao" : "pos_venda_recompra";
      const titulos: Record<string, string> = {
        pos_venda_confirmacao: "Confirmar recebimento",
        pos_venda_satisfacao: "Pesquisa de satisfação",
        pos_venda_recompra: "Sondar recompra",
      };
      const prefixoPv = `Pós-venda D+${d}`;

      for (const l of leads ?? []) {
        const regra = `C_pos_venda_D${d}`;
        if (await alreadyActed(sb, regra, l.id, 30 * 24)) continue;
        if (await hasOpenTask(sb, l.id, tipo)) continue;

        const fechadoDDMM = fmtDDMM(l.etapa_changed_at);
        await criarTarefa({
          regra,
          lead_id: l.id,
          lead_company: l.company,
          owner_id: l.owner_id,
          tipo,
          titulo: withCtx(
            `${prefixoPv}: ${l.company}`,
            fechadoDDMM ? `pedido fechado em ${fechadoDDMM}` : null,
          ),
          descricao: `Pós-venda D+${d}. Requer nota de conclusão. (${titulos[tipo]})`,
          motivo: `Pós-venda D+${d}. Requer nota de conclusão.`,
          prioridade: 2,
        });
        await log(sb, {
          regra,
          leadId: l.id,
          clienteId: l.id,
          vendedorId: l.owner_id,
          acao: "tarefa criada",
          payload: { d, tipo },
        });
        stats.c_pos_venda++;
      }
    }
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
