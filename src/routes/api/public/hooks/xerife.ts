import { createFileRoute } from "@tanstack/react-router";

type XerifeConfig = {
  dias_sem_interacao_por_etapa: Record<string, number>;
  proposta_enviada_dias: number;
  tarefa_atrasada_horas: number;
  ia_sem_resposta_horas: number;
  horario_comercial_inicio: string; // HH:MM:SS
  horario_comercial_fim: string;
  ativo: boolean;
};

function nowInSaoPauloHour(): number {
  // Retorna hora (0-23) atual em America/Sao_Paulo
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

async function runXerife(dryRun = false): Promise<{
  ran: boolean;
  reason?: string;
  followupsCreated: number;
  tarefasAtrasadasSinalizadas: number;
  propostasSemRespostaSinalizadas: number;
  totalActions: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Carrega config
  const { data: cfgRow, error: cfgErr } = await supabaseAdmin
    .from("xerife_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (cfgErr) throw new Error(cfgErr.message);
  const cfg = (cfgRow ?? {
    dias_sem_interacao_por_etapa: { novo: 1, qualificacao: 2, proposta: 3, negociacao: 2 },
    proposta_enviada_dias: 3,
    tarefa_atrasada_horas: 24,
    ia_sem_resposta_horas: 2,
    horario_comercial_inicio: "07:00:00",
    horario_comercial_fim: "20:00:00",
    ativo: true,
  }) as XerifeConfig;

  if (!cfg.ativo) return { ran: false, reason: "xerife inativo", followupsCreated: 0, tarefasAtrasadasSinalizadas: 0, propostasSemRespostaSinalizadas: 0, totalActions: 0 };

  if (!dryRun) {
    const hour = nowInSaoPauloHour();
    const hIni = parseHour(cfg.horario_comercial_inicio);
    const hFim = parseHour(cfg.horario_comercial_fim);
    if (hour < hIni || hour >= hFim) {
      return { ran: false, reason: `fora do horário comercial (${hour}h SP)`, followupsCreated: 0, tarefasAtrasadasSinalizadas: 0, propostasSemRespostaSinalizadas: 0, totalActions: 0 };
    }
  }

  const nowIso = new Date().toISOString();
  const dedupeSinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let followupsCreated = 0;
  let tarefasAtrasadasSinalizadas = 0;
  let propostasSemRespostaSinalizadas = 0;
  let totalActions = 0;

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

      // dedupe: já existe action followup nas últimas 24h para este lead?
      const { count: recentActions } = await supabaseAdmin
        .from("lead_ai_actions")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", l.id)
        .eq("type", "followup")
        .gte("occurred_at", dedupeSinceIso);
      if ((recentActions ?? 0) > 0) continue;

      // dedupe: já existe tarefa aberta de Xerife?
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
          priority: "media",
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
    // dedupe por lead+alerta em 24h
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
    totalActions,
  };
}

export const Route = createFileRoute("/api/public/hooks/xerife")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const dryRun = url.searchParams.get("dry") === "1";
          const result = await runXerife(dryRun);
          return Response.json({ ok: true, at: new Date().toISOString(), ...result });
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

export { runXerife };
