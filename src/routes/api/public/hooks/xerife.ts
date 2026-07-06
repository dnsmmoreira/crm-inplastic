import { createFileRoute } from "@tanstack/react-router";

type XerifeConfig = {
  dias_sem_interacao_por_etapa: Record<string, number>;
  proposta_enviada_dias: number;
  tarefa_atrasada_horas: number;
  ia_sem_resposta_horas: number;
  horario_comercial_inicio: string;
  horario_comercial_fim: string;
  resumo_diario_ativo: boolean;
  resumo_hora: string;
  ativo: boolean;
};

function nowInSaoPauloHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(h);
}

function parseHour(hhmm: string): number {
  return Number(hhmm.slice(0, 2));
}

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function normalizePhoneBR(phone: string) {
  let p = onlyDigits(phone);
  if (!p.startsWith("55") && p.length <= 11) p = `55${p}`;
  return p;
}

/**
 * Envia mensagem WhatsApp direto via Z-API (uso interno do Xerife).
 * NUNCA envia para cliente/lead — apenas para vendedores/admins da equipe.
 */
async function sendZapiText(phoneRaw: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    console.warn("[xerife] Z-API não configurado; pulei envio.");
    return false;
  }
  const phone = normalizePhoneBR(phoneRaw);
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, message }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[xerife] Z-API [${res.status}]: ${body}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[xerife] Z-API erro:", e);
    return false;
  }
}

async function loadConfig(): Promise<XerifeConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("xerife_config").select("*").eq("id", 1).maybeSingle();
  return (data ?? {
    dias_sem_interacao_por_etapa: { novo: 1, qualificacao: 2, proposta: 3, negociacao: 2 },
    proposta_enviada_dias: 3,
    tarefa_atrasada_horas: 24,
    ia_sem_resposta_horas: 2,
    horario_comercial_inicio: "07:00:00",
    horario_comercial_fim: "20:00:00",
    resumo_diario_ativo: true,
    resumo_hora: "08:00:00",
    ativo: true,
  }) as XerifeConfig;
}

async function runXerife(dryRun = false): Promise<{
  ran: boolean;
  reason?: string;
  followupsCreated: number;
  tarefasAtrasadasSinalizadas: number;
  propostasSemRespostaSinalizadas: number;
  alertasWhatsappEnviados: number;
  totalActions: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = await loadConfig();

  if (!cfg.ativo)
    return {
      ran: false,
      reason: "xerife inativo",
      followupsCreated: 0,
      tarefasAtrasadasSinalizadas: 0,
      propostasSemRespostaSinalizadas: 0,
      alertasWhatsappEnviados: 0,
      totalActions: 0,
    };

  if (!dryRun) {
    const hour = nowInSaoPauloHour();
    const hIni = parseHour(cfg.horario_comercial_inicio);
    const hFim = parseHour(cfg.horario_comercial_fim);
    if (hour < hIni || hour >= hFim) {
      return {
        ran: false,
        reason: `fora do horário comercial (${hour}h SP)`,
        followupsCreated: 0,
        tarefasAtrasadasSinalizadas: 0,
        propostasSemRespostaSinalizadas: 0,
        alertasWhatsappEnviados: 0,
        totalActions: 0,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const dedupeSinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let followupsCreated = 0;
  let tarefasAtrasadasSinalizadas = 0;
  let propostasSemRespostaSinalizadas = 0;
  let alertasWhatsappEnviados = 0;
  let totalActions = 0;

  // Cache de telefone WhatsApp por owner_id para alertas urgentes
  const ownerPhoneCache = new Map<string, string | null>();
  async function getOwnerPhone(ownerId: string): Promise<string | null> {
    if (ownerPhoneCache.has(ownerId)) return ownerPhoneCache.get(ownerId)!;
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("telefone_whatsapp")
      .eq("id", ownerId)
      .maybeSingle();
    const p = (data?.telefone_whatsapp ?? "").trim() || null;
    ownerPhoneCache.set(ownerId, p);
    return p;
  }

  // Envia alerta urgente para o dono do lead, com cap de 1 msg/lead/dia.
  async function tryUrgentWhatsapp(leadId: string, ownerId: string | null, msg: string) {
    if (!ownerId) return;
    // dedupe: já existe alerta WhatsApp para este lead nas últimas 24h?
    const { count } = await supabaseAdmin
      .from("lead_ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("type", "alerta")
      .contains("metadata", { channel: "whatsapp" })
      .gte("occurred_at", dedupeSinceIso);
    if ((count ?? 0) > 0) return;
    const phone = await getOwnerPhone(ownerId);
    if (!phone) return;
    const ok = await sendZapiText(phone, msg);
    if (!ok) return;
    await supabaseAdmin.from("lead_ai_actions").insert({
      lead_id: leadId,
      owner_id: ownerId,
      type: "alerta",
      content: `Xerife WhatsApp: ${msg}`,
      metadata: { channel: "whatsapp", urgent: true },
      occurred_at: new Date().toISOString(),
    });
    alertasWhatsappEnviados++;
    totalActions++;
  }

  // ---------- Regra 1: leads sem interação por etapa ----------
  const stages = ["novo", "qualificacao", "proposta", "negociacao"] as const;
  for (const stage of stages) {
    const dias = cfg.dias_sem_interacao_por_etapa?.[stage];
    if (!dias || dias <= 0) continue;
    const thresholdIso = new Date(Date.now() - dias * 86400 * 1000).toISOString();
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, company, owner_id, last_interaction_at, created_at, stage")
      .eq("stage", stage)
      .not("owner_id", "is", null);

    for (const l of leads ?? []) {
      const last = l.last_interaction_at ?? l.created_at;
      if (!last || new Date(last) > new Date(thresholdIso)) continue;

      const { count: recentActions } = await supabaseAdmin
        .from("lead_ai_actions")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", l.id)
        .eq("type", "followup")
        .gte("occurred_at", dedupeSinceIso);
      if ((recentActions ?? 0) > 0) continue;

      const title = `Follow-up Xerife: ${l.company}`;
      const { count: openTasks } = await supabaseAdmin
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", l.id)
        .eq("title", title)
        .eq("done", false);

      if ((openTasks ?? 0) === 0) {
        const due = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const { error: tErr } = await supabaseAdmin.from("tarefas").insert({
          lead_id: l.id,
          owner_id: l.owner_id,
          title,
          due_date: due,
          kind: "followup",
          auto_generated: true,
        });
        if (!tErr) followupsCreated++;
      }

      await supabaseAdmin.from("lead_ai_actions").insert({
        lead_id: l.id,
        owner_id: l.owner_id,
        type: "followup",
        content: `Xerife: lead na etapa "${stage}" sem interação há ${dias}+ dia(s). Follow-up sugerido.`,
        metadata: { stage, dias_limite: dias, last_interaction_at: last },
        occurred_at: nowIso,
      });
      totalActions++;
    }
  }

  // ---------- Regra 2: tarefas atrasadas ----------
  const atrasadaLimiteIso = new Date(Date.now() - cfg.tarefa_atrasada_horas * 3600 * 1000).toISOString();
  const { data: tarefasAtrasadas } = await supabaseAdmin
    .from("tarefas")
    .select("id, lead_id, owner_id, title, due_date")
    .eq("done", false)
    .lt("due_date", atrasadaLimiteIso);

  for (const t of tarefasAtrasadas ?? []) {
    if (!t.lead_id) continue;
    const { count } = await supabaseAdmin
      .from("lead_ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", t.lead_id)
      .eq("type", "alerta")
      .gte("occurred_at", dedupeSinceIso);
    if ((count ?? 0) > 0) continue;

    await supabaseAdmin.from("lead_ai_actions").insert({
      lead_id: t.lead_id,
      owner_id: t.owner_id,
      type: "alerta",
      content: `Xerife: tarefa "${t.title}" atrasada há mais de ${cfg.tarefa_atrasada_horas}h.`,
      metadata: { tarefa_id: t.id, due_date: t.due_date },
      occurred_at: nowIso,
    });
    tarefasAtrasadasSinalizadas++;
    totalActions++;

    // Alerta urgente WhatsApp (1x por lead / dia)
    await tryUrgentWhatsapp(
      t.lead_id,
      t.owner_id,
      `⚠️ Xerife: tarefa "${t.title}" está atrasada há mais de ${cfg.tarefa_atrasada_horas}h. Acesse o CRM para atualizar.`,
    );
  }

  // ---------- Regra 3: propostas enviadas sem resposta ----------
  const propLimiteIso = new Date(Date.now() - cfg.proposta_enviada_dias * 86400 * 1000).toISOString();
  const { data: propostas } = await supabaseAdmin
    .from("propostas")
    .select("id, lead_id, owner_id, number, sent_at, status")
    .eq("status", "enviada")
    .not("sent_at", "is", null)
    .lt("sent_at", propLimiteIso);

  for (const p of propostas ?? []) {
    if (!p.lead_id) continue;
    const { count } = await supabaseAdmin
      .from("lead_ai_actions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", p.lead_id)
      .eq("type", "followup")
      .gte("occurred_at", dedupeSinceIso);
    if ((count ?? 0) > 0) continue;

    await supabaseAdmin.from("lead_ai_actions").insert({
      lead_id: p.lead_id,
      owner_id: p.owner_id,
      type: "followup",
      content: `Xerife: proposta ${p.number ?? p.id.slice(0, 8)} enviada há ${cfg.proposta_enviada_dias}+ dia(s) sem resposta.`,
      metadata: { proposta_id: p.id, sent_at: p.sent_at },
      occurred_at: nowIso,
    });
    propostasSemRespostaSinalizadas++;
    totalActions++;
  }

  return {
    ran: true,
    followupsCreated,
    tarefasAtrasadasSinalizadas,
    propostasSemRespostaSinalizadas,
    alertasWhatsappEnviados,
    totalActions,
  };
}

/**
 * Resumo diário para cada vendedor (dados do próprio funil) + consolidado para admins.
 * Enviado por WhatsApp. Sempre respeita cfg.resumo_diario_ativo.
 */
async function runResumoDiario(force = false): Promise<{
  ran: boolean;
  reason?: string;
  vendedoresNotificados: number;
  adminsNotificados: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cfg = await loadConfig();
  if (!cfg.ativo || !cfg.resumo_diario_ativo) {
    return { ran: false, reason: "resumo desativado", vendedoresNotificados: 0, adminsNotificados: 0 };
  }
  if (!force) {
    const spHour = nowInSaoPauloHour();
    const targetHour = parseHour(cfg.resumo_hora);
    if (spHour !== targetHour) {
      return { ran: false, reason: `hora atual ${spHour}h ≠ resumo_hora ${targetHour}h (SP)`, vendedoresNotificados: 0, adminsNotificados: 0 };
    }
  }

  const nowIso = new Date().toISOString();
  const startOfDayIso = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const endOfDayIso = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();

  // Coleta roles + telefones
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
  const adminIds = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
  const vendedorIds = new Set((roles ?? []).filter((r: any) => r.role === "vendedor").map((r: any) => r.user_id));

  const allIds = Array.from(new Set([...adminIds, ...vendedorIds]));
  if (!allIds.length) {
    return { ran: false, reason: "sem usuários", vendedoresNotificados: 0, adminsNotificados: 0 };
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, telefone_whatsapp")
    .in("id", allIds);
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  let vendedoresNotificados = 0;
  let adminsNotificados = 0;

  async function statsForOwner(ownerId: string | null) {
    // null => todos (visão admin)
    const baseLeads = supabaseAdmin.from("leads").select("id, company, stage, last_interaction_at, owner_id");
    const baseTarefas = supabaseAdmin.from("tarefas").select("id, title, due_date, owner_id, done").eq("done", false);
    const baseProp = supabaseAdmin
      .from("propostas")
      .select("id, number, sent_at, status, owner_id")
      .eq("status", "enviada")
      .not("sent_at", "is", null);

    const [{ data: leads }, { data: tarefas }, { data: propostas }] = await Promise.all([
      ownerId ? baseLeads.eq("owner_id", ownerId) : baseLeads,
      ownerId ? baseTarefas.eq("owner_id", ownerId) : baseTarefas,
      ownerId ? baseProp.eq("owner_id", ownerId) : baseProp,
    ]);

    const now = Date.now();
    const tarefasHoje = (tarefas ?? []).filter(
      (t: any) => t.due_date && t.due_date >= startOfDayIso && t.due_date <= endOfDayIso,
    );
    const tarefasVencidas = (tarefas ?? []).filter((t: any) => t.due_date && t.due_date < startOfDayIso);
    const leadsUrgentes = (leads ?? []).filter((l: any) => {
      const dias = cfg.dias_sem_interacao_por_etapa?.[l.stage] ?? 999;
      const last = l.last_interaction_at ? new Date(l.last_interaction_at).getTime() : 0;
      return last > 0 && (now - last) / 86400000 >= dias;
    });
    const propostasParadas = (propostas ?? []).filter(
      (p: any) => (now - new Date(p.sent_at).getTime()) / 86400000 >= cfg.proposta_enviada_dias,
    );

    return { tarefasHoje, tarefasVencidas, leadsUrgentes, propostasParadas };
  }

  function formatMsg(nome: string, isAdmin: boolean, s: Awaited<ReturnType<typeof statsForOwner>>) {
    const lines: string[] = [];
    lines.push(`🤠 *Resumo Xerife* — ${new Date().toLocaleDateString("pt-BR")}`);
    lines.push(`Olá, ${nome}!${isAdmin ? " (visão consolidada)" : ""}`);
    lines.push("");
    lines.push(`📌 Leads urgentes (sem interação): *${s.leadsUrgentes.length}*`);
    lines.push(`📅 Tarefas para hoje: *${s.tarefasHoje.length}*`);
    lines.push(`⏰ Tarefas vencidas: *${s.tarefasVencidas.length}*`);
    lines.push(`📄 Propostas paradas (>${cfg.proposta_enviada_dias}d): *${s.propostasParadas.length}*`);
    if (s.leadsUrgentes.length) {
      lines.push("");
      lines.push("*Top leads urgentes:*");
      s.leadsUrgentes.slice(0, 5).forEach((l: any) => lines.push(`• ${l.company} (${l.stage})`));
    }
    lines.push("");
    lines.push("Acesse o CRM para atuar.");
    return lines.join("\n");
  }

  // Vendedores
  for (const uid of vendedorIds) {
    const prof: any = profileById.get(uid);
    const phone = prof?.telefone_whatsapp?.trim();
    if (!phone) continue;
    const s = await statsForOwner(uid);
    const total = s.leadsUrgentes.length + s.tarefasHoje.length + s.tarefasVencidas.length + s.propostasParadas.length;
    if (total === 0) continue;
    const msg = formatMsg(prof?.name ?? "vendedor", false, s);
    if (dryRun) {
      vendedoresNotificados++;
      continue;
    }
    const ok = await sendZapiText(phone, msg);
    if (ok) {
      vendedoresNotificados++;
      await supabaseAdmin.from("lead_ai_actions").insert({
        lead_id: null,
        owner_id: uid,
        type: "resumo",
        content: `Resumo diário enviado para ${prof?.name ?? uid}.`,
        metadata: { channel: "whatsapp", role: "vendedor", counts: {
          leadsUrgentes: s.leadsUrgentes.length,
          tarefasHoje: s.tarefasHoje.length,
          tarefasVencidas: s.tarefasVencidas.length,
          propostasParadas: s.propostasParadas.length,
        } },
        occurred_at: nowIso,
      });
    }
  }

  // Admins (visão consolidada)
  const consolidated = await statsForOwner(null);
  for (const uid of adminIds) {
    const prof: any = profileById.get(uid);
    const phone = prof?.telefone_whatsapp?.trim();
    if (!phone) continue;
    const msg = formatMsg(prof?.name ?? "admin", true, consolidated);
    if (dryRun) {
      adminsNotificados++;
      continue;
    }
    const ok = await sendZapiText(phone, msg);
    if (ok) {
      adminsNotificados++;
      await supabaseAdmin.from("lead_ai_actions").insert({
        lead_id: null,
        owner_id: uid,
        type: "resumo",
        content: `Resumo diário consolidado enviado para ${prof?.name ?? uid}.`,
        metadata: { channel: "whatsapp", role: "admin", counts: {
          leadsUrgentes: consolidated.leadsUrgentes.length,
          tarefasHoje: consolidated.tarefasHoje.length,
          tarefasVencidas: consolidated.tarefasVencidas.length,
          propostasParadas: consolidated.propostasParadas.length,
        } },
        occurred_at: nowIso,
      });
    }
  }

  return { ran: true, vendedoresNotificados, adminsNotificados };
}

export const Route = createFileRoute("/api/public/hooks/xerife")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.XERIFE_SECRET;
        const provided = request.headers.get("x-xerife-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const dryRun = url.searchParams.get("dry") === "1";
          const mode = url.searchParams.get("mode") ?? "engine";

          if (mode === "digest") {
            const result = await runResumoDiario(dryRun);
            return Response.json({ ok: true, mode, at: new Date().toISOString(), ...result });
          }

          const result = await runXerife(dryRun);
          return Response.json({ ok: true, mode: "engine", at: new Date().toISOString(), ...result });
        } catch (e) {
          console.error("xerife error", e);
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

export { runXerife, runResumoDiario };
