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
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: SP_TZ, day: "2-digit", month: "2-digit" }).format(d);
  return p;
}
function fmtHHhMM(iso: string | null | undefined): string | null {
  const d = _valid(iso);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: SP_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
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
  acao: "criar_tarefa" | "notificar_diretoria" | "marcar_esfriando";
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
  };
}

type Stats = Record<string, number>;

async function runEngine(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{
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
    a1_primeiro_contato: 0, a1_escalado: 0,
    a2_lead_parado: 0,
    a3_sem_resposta: 0, a3_escalado: 0,
    a4_cadencia_proposta: 0,
    b1_carteira_45: 0,
    b2_carteira_60: 0,
    b3_reciclagem: 0,
    c_pos_venda: 0,
  };

  const plan: XerifePlanItem[] = [];

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
      regra: t.regra, lead_id: t.lead_id, lead_company: t.lead_company,
      owner_id: t.owner_id, tipo: t.tipo, titulo: t.titulo,
      descricao: t.descricao, motivo: t.motivo, prioridade: t.prioridade,
      acao: "criar_tarefa",
    });
    if (dryRun) return;
    await sb.from("tarefas").insert({
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
      regra: ctx.regra, lead_id: ctx.lead_id, lead_company: ctx.lead_company,
      owner_id: ctx.owner_id, tipo: "alerta_diretoria", titulo: "Notificar diretoria",
      descricao: msg, motivo: msg, prioridade: 0, acao: "notificar_diretoria",
    });
    if (dryRun) return;
    await notifyDiretoria(msg);
  };
  const marcarEsfriando = async (leadId: string, company: string | null, ownerId: string | null, regra: string) => {
    plan.push({
      regra, lead_id: leadId, lead_company: company, owner_id: ownerId,
      tipo: "esfriando", titulo: "Marcar lead como esfriando",
      descricao: "Definir esfriando=true", motivo: "lead parado além do máximo",
      prioridade: 3, acao: "marcar_esfriando",
    });
    if (dryRun) return;
    await sb.from("leads").update({ esfriando: true }).eq("id", leadId);
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
          regra, lead_id: l.id, lead_company: l.company, owner_id: null,
          tipo: "atribuir_vendedor", titulo: "Atribuir vendedor (round-robin)",
          descricao: `Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis — atribuir via fila.`,
          motivo: `Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis.`,
          prioridade: 1, acao: "criar_tarefa",
        });
        if (!dryRun) {
          const { data: newOwner, error: rpcErr } = await sb.rpc("atribuir_proximo_vendedor", { _lead_id: l.id });
          if (rpcErr) {
            await alertDiretoria(
              `⚠️ Falha ao atribuir automaticamente lead órfão\n\nCliente: ${l.company}\nErro: ${rpcErr.message}\n${crmLeadLink(l.id)}`,
              { regra, lead_id: l.id, lead_company: l.company, owner_id: null },
            );
          }
          await log(sb, {
            regra, leadId: l.id, vendedorId: (newOwner as string) ?? null,
            acao: rpcErr ? "atribuição falhou → diretoria notificada" : "atribuído via round-robin",
            payload: { sla_min: cfg.sla_lead_orfao_min, created_at: l.created_at, auto: true, erro: rpcErr?.message ?? null },
          });
        }
      } else {
        await alertDiretoria(
          `🟡 Lead sem vendedor há +${cfg.sla_lead_orfao_min} min úteis\n\nCliente: ${l.company}\nAtribua manualmente.\n${crmLeadLink(l.id)}`,
          { regra, lead_id: l.id, lead_company: l.company, owner_id: null },
        );
        await log(sb, {
          regra, leadId: l.id, vendedorId: null,
          acao: "diretoria notificada (atribuição manual)",
          payload: { sla_min: cfg.sla_lead_orfao_min, created_at: l.created_at, auto: false },
        });
      }
      stats.a0_lead_orfao++;
    }
  }

  // ─────────────── A1: primeiro contato (SLA em min úteis) ───────────────
  {
    const thresholdIso = subtractBusinessMinutes(cfg.sla_primeiro_contato_min, win, now).toISOString();
    const escalarIso = subtractBusinessMinutes(cfg.sla_primeiro_contato_escalar_min, win, now).toISOString();

    const { data: leads } = await sb
      .from("leads")
      .select("id, company, owner_id, created_at, last_contact_at, last_interaction_at, origem, source")
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
        ? (canal ? `lead chegou às ${hora} via ${canal}` : `lead chegou às ${hora}`)
        : null;
      await criarTarefa({
        regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
        tipo: "primeiro_contato",
        titulo: withCtx(`Primeiro contato: ${l.company}`, ctxPc),
        descricao: `Lead entrou há mais de ${cfg.sla_primeiro_contato_min} min úteis e não teve nenhum contato.`,
        motivo: `Lead entrou há mais de ${cfg.sla_primeiro_contato_min} min úteis e não teve nenhum contato.`,
        prioridade: 1,
        });
      await log(sb, {
        regra, leadId: l.id, vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { created_at: l.created_at, sla_min: cfg.sla_primeiro_contato_min },
      });
      stats.a1_primeiro_contato++;

      // Escalar diretoria se passou do limite
      if (l.created_at && l.created_at < escalarIso) {
        const escRegra = "A1_escalado";
        if (!(await alreadyActed(sb, escRegra, l.id, 24))) {
          await alertDiretoria(
            `🚨 Lead sem contato há +${cfg.sla_primeiro_contato_escalar_min}min úteis\n\n` +
            `Cliente: ${l.company}\nMotivo: vendedor não fez primeiro contato\n${crmLeadLink(l.id)}`,
            { regra: escRegra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
          );
          await log(sb, {
            regra: escRegra, leadId: l.id, vendedorId: l.owner_id,
            acao: "diretoria notificada",
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
          regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
          tipo: "follow_up",
          titulo: withCtx(`Destravar ${l.company}`, `parado em ${etapaLabel} há ${diasParado} dias`),
          descricao: `Lead parado em "${stage}" há +${maxDias} dias. Ligar/definir próximo passo.`,
          motivo: `Lead parado em "${stage}" há +${maxDias} dias. Ligar/definir próximo passo.`,
          prioridade: 2,
          });
        await marcarEsfriando(l.id, l.company, l.owner_id, regra);
        await log(sb, {
          regra, leadId: l.id, vendedorId: l.owner_id,
          acao: "tarefa criada + esfriando=true",
          payload: { stage, max_dias: maxDias, etapa_changed_at: l.etapa_changed_at },
        });
        stats.a2_lead_parado++;
      }
    }
  }

  // ─────────────── A3: cliente sem resposta no WhatsApp (pula ia_ativa=true) ───────────────
  {
    const thresholdIso = subtractBusinessHours(cfg.sla_resposta_whatsapp_horas, win, now).toISOString();
    const escalarIso = subtractBusinessHours(cfg.sla_resposta_whatsapp_escalar_horas, win, now).toISOString();

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

      // CRÍTICO: pular se IA (Lucas) está ativa na conversa
      const { data: conv } = await sb
        .from("whatsapp_conversas")
        .select("ia_ativa, status")
        .eq("lead_id", l.id)
        .maybeSingle();
      if (conv?.ia_ativa === true) continue;

      const regra = "A3_sem_resposta";
      if (await alreadyActed(sb, regra, l.id, 12)) continue;
      if (await hasOpenTask(sb, l.id, "resposta_pendente")) continue;

      const hEspera = horasDesde(l.ultima_msg_cliente_at, now);
      await criarTarefa({
        regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
        tipo: "resposta_pendente",
        titulo: withCtx(`Responder ${l.company}`, hEspera != null ? `cliente aguardando há ${hEspera}h` : null),
        descricao: `Cliente enviou mensagem há +${cfg.sla_resposta_whatsapp_horas}h úteis sem resposta.`,
        motivo: `Cliente enviou mensagem há +${cfg.sla_resposta_whatsapp_horas}h úteis sem resposta.`,
        prioridade: 1,
        });
      await log(sb, {
        regra, leadId: l.id, vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { ultima_msg_cliente_at: l.ultima_msg_cliente_at, sla_h: cfg.sla_resposta_whatsapp_horas },
      });
      stats.a3_sem_resposta++;

      if (l.ultima_msg_cliente_at < escalarIso) {
        const escRegra = "A3_escalado";
        if (!(await alreadyActed(sb, escRegra, l.id, 24))) {
          await alertDiretoria(
            `🚨 Cliente sem resposta +${cfg.sla_resposta_whatsapp_escalar_horas}h úteis\n\n` +
            `Cliente: ${l.company}\n${crmLeadLink(l.id)}`,
            { regra: escRegra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id },
          );
          await log(sb, {
            regra: escRegra, leadId: l.id, vendedorId: l.owner_id,
            acao: "diretoria notificada",
          });
          stats.a3_escalado++;
        }
      }
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
      const diasCorridos = Math.floor((now.getTime() - new Date(l.proposta_enviada_at!).getTime()) / 86400_000);
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
        ? (isDecisao
            ? `sem retorno desde ${propDDMM}, retomar ou marcar perdido`
            : `proposta enviada em ${propDDMM}`)
        : null;
      await criarTarefa({
        regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
        tipo: "cadencia_proposta",
        titulo: withCtx(baseTitulo, ctxA4),
        descricao: `Proposta enviada há ${passo} dias. Cadência: ${cfg.cadencia_proposta_dias.join("/")}.`,
        motivo: `Proposta enviada há ${passo} dias. Cadência: ${cfg.cadencia_proposta_dias.join("/")}.`,
        prioridade: 2,
        });
      await log(sb, {
        regra, leadId: l.id, vendedorId: l.owner_id,
        acao: "tarefa criada",
        payload: { dias_corridos: diasCorridos, cadencia: cfg.cadencia_proposta_dias },
      });
      stats.a4_cadencia_proposta++;
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

      await criarTarefa({
        regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
        tipo: "resgate_carteira",
        titulo: `Reaquecer cliente: ${l.company}`,
        descricao: `Cliente ganho sem contato há +${cfg.carteira_alerta_dias} dias.`,
        motivo: `Cliente ganho sem contato há +${cfg.carteira_alerta_dias} dias.`,
        prioridade: 3,
        });
      await log(sb, {
        regra, leadId: l.id, clienteId: l.id, vendedorId: l.owner_id,
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
        await criarTarefa({
          regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
          tipo: "resgate_carteira",
          titulo: `URGENTE reaquecer: ${l.company}`,
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
        regra, leadId: l.id, clienteId: l.id, vendedorId: l.owner_id,
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
      .select("id, company, owner_id, updated_at")
      .eq("stage", "perdido" as any)
      .lt("updated_at", isoLim)
      .not("owner_id", "is", null)
      .limit(500);

    for (const l of leads ?? []) {
      const regra = "B3_reciclagem";
      if (await alreadyActed(sb, regra, l.id, 30 * 24)) continue;
      if (await hasOpenTask(sb, l.id, "reativacao_lead")) continue;

      await criarTarefa({
        regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
        tipo: "reativacao_lead",
        titulo: `Reativar lead perdido: ${l.company}`,
        descricao: `Perdido há +${cfg.reciclagem_perdidos_dias} dias. Vale nova tentativa.`,
        motivo: `Perdido há +${cfg.reciclagem_perdidos_dias} dias. Vale nova tentativa.`,
        prioridade: 4,
        });
      await log(sb, {
        regra, leadId: l.id, vendedorId: l.owner_id,
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
        d <= 5 ? "pos_venda_confirmacao"
        : d <= 20 ? "pos_venda_satisfacao"
        : "pos_venda_recompra";
      const titulos: Record<string, string> = {
        pos_venda_confirmacao: "Confirmar recebimento",
        pos_venda_satisfacao: "Pesquisa de satisfação",
        pos_venda_recompra: "Sondar recompra",
      };

      for (const l of leads ?? []) {
        const regra = `C_pos_venda_D${d}`;
        if (await alreadyActed(sb, regra, l.id, 30 * 24)) continue;
        if (await hasOpenTask(sb, l.id, tipo)) continue;

        await criarTarefa({
          regra, lead_id: l.id, lead_company: l.company, owner_id: l.owner_id,
          tipo,
          titulo: `${titulos[tipo]}: ${l.company}`,
          descricao: `Pós-venda D+${d}. Requer nota de conclusão.`,
          motivo: `Pós-venda D+${d}. Requer nota de conclusão.`,
          prioridade: 2,
        });
        await log(sb, {
          regra, leadId: l.id, clienteId: l.id, vendedorId: l.owner_id,
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
        const expected = process.env.XERIFE_SECRET;
        const provided = request.headers.get("x-xerife-secret");
        const isCron = request.headers.get("apikey") === process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!isCron && (!expected || provided !== expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const dryRun = url.searchParams.get("dryRun") === "1";
          const result = await runEngine({ force, dryRun });
          return Response.json({ ok: true, at: new Date().toISOString(), ...result });
        } catch (e) {
          console.error("[xerife-engine] error:", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

export { runEngine as runXerifeEngine };
