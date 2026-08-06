/**
 * Watchdog de conversa parada na IA.
 *
 * Detecta conversas em `ia_atendendo` que ficaram silenciosas além da janela
 * configurada (minutos ÚTEIS) e ainda não viraram lead, e então:
 *   1. cria o lead (owner_id = null, mesma forma do fluxo ia-qualificar)
 *   2. grava lead_id na conversa
 *   3. chama a RPC atribuir_proximo_vendedor (round-robin; ela mesma desliga a IA)
 *   4. notifica o vendedor (notifyOwner -> Telegram/WhatsApp interno)
 *
 * Idempotente:
 *   - o filtro `lead_id IS NULL` remove a conversa do conjunto após a 1ª ação
 *   - dedupe adicional em xerife_log (regra 'watchdog_conversa_ia', janela 24h)
 *   - LIMIT 50 por rodada
 *
 * Nunca altera a ordem da fila (apenas consome a RPC), nunca toca em leads
 * existentes (somente INSERT de leads novos) e nunca envia nada ao cliente.
 */
import {
  isBusinessNow,
  subtractBusinessMinutes,
  type BusinessWindow,
} from "@/lib/xerife/businessTime.server";
import { logAction } from "@/lib/xerife/dedupe.server";
import { notifyOwner, notifyDiretoria, crmLeadLink } from "@/lib/xerife/notify.server";

export const REGRA = "watchdog_conversa_ia";
const LOTE = 50;
const DEDUPE_HORAS = 24;

export type WatchdogPlanItem = {
  conversa_id: string;
  phone: string;
  name: string | null;
  parada_desde: string | null;
  acao: string;
};

export type WatchdogResult = {
  ran: boolean;
  reason?: string;
  dryRun: boolean;
  stats: {
    candidatas: number;
    leads_criados: number;
    atribuidos: number;
    sem_vendedor: number;
    notificados: number;
    pulados_dedupe: number;
    erros: number;
    frias_candidatas: number;
    frias_atribuidas: number;
    frias_notificadas: number;
    frias_puladas: number;
  };
  plan: WatchdogPlanItem[];
};

type Cfg = {
  watchdog_conversa_ativo: boolean;
  watchdog_conversa_ia_min: number;
  watchdog_conversa_fria_min: number;
  dias_uteis_inicio: string;
  dias_uteis_fim: string;
};

async function loadCfg(): Promise<Cfg> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("xerife_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const d: any = data ?? {};
  return {
    watchdog_conversa_ativo: d.watchdog_conversa_ativo ?? false,
    watchdog_conversa_ia_min: d.watchdog_conversa_ia_min ?? 15,
    watchdog_conversa_fria_min: d.watchdog_conversa_fria_min ?? 20,
    dias_uteis_inicio: (d.dias_uteis_inicio ?? "08:00:00").slice(0, 5),
    dias_uteis_fim: (d.dias_uteis_fim ?? "18:00:00").slice(0, 5),
  };
}

/** Já agimos nesta conversa nas últimas N horas? (dedupe por payload.conversa_id) */
async function alreadyActedConversa(sb: any, conversaId: string): Promise<boolean> {
  const sinceIso = new Date(Date.now() - DEDUPE_HORAS * 3600 * 1000).toISOString();
  const { count } = await sb
    .from("xerife_log")
    .select("id", { count: "exact", head: true })
    .eq("regra", REGRA)
    .gte("created_at", sinceIso)
    .contains("payload", { conversa_id: conversaId });
  return (count ?? 0) > 0;
}

export async function runWatchdogConversa(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<WatchdogResult> {
  const force = opts.force ?? false;
  const dryRun = opts.dryRun ?? false;
  const stats = {
    candidatas: 0,
    leads_criados: 0,
    atribuidos: 0,
    sem_vendedor: 0,
    notificados: 0,
    pulados_dedupe: 0,
    erros: 0,
  };
  const plan: WatchdogPlanItem[] = [];

  const cfg = await loadCfg();
  if (!cfg.watchdog_conversa_ativo && !force) {
    return { ran: false, reason: "watchdog desligado", dryRun, stats, plan };
  }

  const win: BusinessWindow = { inicio: cfg.dias_uteis_inicio, fim: cfg.dias_uteis_fim };
  if (!force && !isBusinessNow(win)) {
    return { ran: false, reason: "fora do horário útil SP", dryRun, stats, plan };
  }

  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

  const thresholdIso = subtractBusinessMinutes(
    cfg.watchdog_conversa_ia_min,
    win,
    new Date(),
  ).toISOString();

  const { data: conversas, error } = await sb
    .from("whatsapp_conversas")
    .select("id, phone, name, last_message_at, last_message_preview, created_at")
    .eq("status", "ia_atendendo")
    .eq("ia_ativa", true)
    .eq("requer_humano", false)
    .is("lead_id", null)
    .lt("last_message_at", thresholdIso)
    .order("last_message_at", { ascending: true })
    .limit(LOTE);

  if (error) {
    return { ran: false, reason: error.message, dryRun, stats, plan };
  }

  const lista = conversas ?? [];
  stats.candidatas = lista.length;

  for (const conv of lista as any[]) {
    try {
      if (await alreadyActedConversa(sb, conv.id)) {
        stats.pulados_dedupe++;
        continue;
      }

      if (dryRun) {
        plan.push({
          conversa_id: conv.id,
          phone: conv.phone,
          name: conv.name ?? null,
          parada_desde: conv.last_message_at ?? conv.created_at ?? null,
          acao: "criar lead + atribuir via fila + notificar vendedor",
        });
        continue;
      }

      // 1) Cria o lead (mesma forma do fluxo ia-qualificar: owner_id null, stage novo)
      const company = conv.name?.trim() || `WhatsApp ${conv.phone}`;
      const contactName = conv.name?.trim() || "A identificar";
      const notesLines: string[] = [
        `Watchdog: conversa parada na IA há +${cfg.watchdog_conversa_ia_min} min úteis.`,
      ];
      if (conv.last_message_preview)
        notesLines.push(`Última mensagem: "${conv.last_message_preview}"`);

      const { data: lead, error: lErr } = await sb
        .from("leads")
        .insert({
          owner_id: null,
          company,
          contact_name: contactName,
          phone: conv.phone,
          telefone_whatsapp: conv.phone,
          stage: "novo",
          origem: "whatsapp",
          source: "WhatsApp Watchdog",
          tags: ["WhatsApp", "Watchdog"],
          notes: notesLines.join("\n"),
        })
        .select("id")
        .single();

      if (lErr || !lead) {
        stats.erros++;
        console.error("[watchdog-conversa] falha ao criar lead:", lErr?.message);
        continue;
      }
      stats.leads_criados++;

      // 2) Vincula o lead à conversa (tira a conversa do conjunto nas próximas rodadas)
      await sb
        .from("whatsapp_conversas")
        .update({ lead_id: lead.id, updated_at: new Date().toISOString() })
        .eq("id", conv.id);

      // 3) Round-robin (a própria RPC move a etapa e desliga a IA da conversa)
      let vendedorId: string | null = null;
      let erroFila: string | null = null;
      const { data: rpcData, error: rpcErr } = await sb.rpc("atribuir_proximo_vendedor", {
        _lead_id: lead.id,
      });
      if (rpcErr) {
        erroFila = rpcErr.message;
        stats.sem_vendedor++;
        console.error("[watchdog-conversa] atribuir_proximo_vendedor falhou:", rpcErr.message);
      } else {
        vendedorId = (rpcData as string) ?? null;
        if (vendedorId) stats.atribuidos++;
        else stats.sem_vendedor++;
      }

      // 4) Notificação interna
      if (vendedorId) {
        const ok = await notifyOwner(
          vendedorId,
          `🔔 Lead novo do WhatsApp (watchdog)\n\nCliente: ${company}\nTelefone: ${conv.phone}\nA IA ficou +${cfg.watchdog_conversa_ia_min} min úteis sem avançar.\n${crmLeadLink(lead.id)}`,
        );
        if (ok) stats.notificados++;
      } else {
        await notifyDiretoria(
          `⚠️ Watchdog: conversa parada virou lead SEM vendedor\n\nCliente: ${company}\nTelefone: ${conv.phone}\nMotivo: ${erroFila ?? "nenhum vendedor ativo na fila"}\n${crmLeadLink(lead.id)}`,
        );
      }

      await logAction(sb, {
        regra: REGRA,
        leadId: lead.id,
        vendedorId,
        acao: vendedorId ? "lead criado e atribuído" : "lead criado sem vendedor",
        payload: {
          conversa_id: conv.id,
          phone: conv.phone,
          janela_min_uteis: cfg.watchdog_conversa_ia_min,
          parada_desde: conv.last_message_at ?? null,
          erro_fila: erroFila,
        },
      });
    } catch (e) {
      stats.erros++;
      console.error(
        "[watchdog-conversa] erro na conversa",
        conv.id,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return { ran: true, dryRun, stats, plan };
}
