/**
 * Xerife — Agenda Diária (07:30 SP dias úteis).
 * Para cada vendedor: monta lista priorizada de tarefas pendentes de HOJE
 * (+ antecipa carteira/reciclagem se abaixo da meta) e envia via Z-API.
 *
 * Idempotente: grava em xerife_log com regra='agenda_diaria' + janela 20h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { alreadyActed, logAction } from "@/lib/xerife/dedupe.server";
import { notifyOwner, crmLeadLink } from "@/lib/xerife/notify.server";

const TIPO_ORDEM: Record<string, number> = {
  resposta_pendente: 1,
  primeiro_contato: 2,
  pos_venda_confirmacao: 3,
  cadencia_proposta: 4,
  follow_up: 5,
  pos_venda_satisfacao: 6,
  pos_venda_recompra: 7,
  resgate_carteira: 8,
  reativacao_lead: 9,
  prospeccao: 10,
};

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

async function runAgendaDiaria(force = false): Promise<{
  vendedoresNotificados: number;
  totalTarefas: number;
  antecipadas: number;
}> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: cfgRaw } = await sb.from("xerife_config").select("*").eq("id", 1).maybeSingle();
  const cfg: any = cfgRaw ?? {};
  const meta = cfg.meta_atividades_dia ?? 15;

  const { data: vendedores } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("role", "vendedor" as any);

  let vendedoresNotificados = 0;
  let totalTarefas = 0;
  let antecipadas = 0;

  // dedupe global (mantém comportamento): se já rodou nas últimas 20h, sai antes do loop
  if (!force && (await alreadyActed(sb, "agenda_diaria", null, 20))) {
    return { vendedoresNotificados: 0, totalTarefas: 0, antecipadas: 0 };
  }

  let vendedoresSemNada = 0;
  const vendedoresProcessados = (vendedores ?? []).length;

  for (const v of vendedores ?? []) {
    const uid = v.user_id;


    // Tarefas de hoje (pendente/adiada) desse vendedor
    const { data: hoje } = await sb
      .from("tarefas")
      .select("id, lead_id, tipo, title, descricao, prioridade, escalonamentos, hora_sugerida, due_date")
      .eq("owner_id", uid)
      .in("status", ["pendente", "adiada"])
      .lte("due_date", endOfTodayIso())
      .order("prioridade", { ascending: true })
      .limit(100);

    let lista = (hoje ?? []).slice();

    // Se abaixo da meta, antecipa carteira/reciclagem futuras
    if (lista.length < meta) {
      const falta = meta - lista.length;
      const { data: extras } = await sb
        .from("tarefas")
        .select("id, lead_id, tipo, title, descricao, prioridade, escalonamentos, hora_sugerida, due_date")
        .eq("owner_id", uid)
        .in("status", ["pendente", "adiada"])
        .in("tipo", ["resgate_carteira", "reativacao_lead"])
        .gt("due_date", endOfTodayIso())
        .order("due_date", { ascending: true })
        .limit(falta);
      if (extras?.length) {
        const ids = extras.map((e: any) => e.id);
        await sb.from("tarefas").update({ due_date: new Date().toISOString() }).in("id", ids);
        antecipadas += extras.length;
        lista = lista.concat(extras);
      }
    }

    // Ordena por (escalonamentos desc, prioridade asc, tipo weight)
    lista.sort((a: any, b: any) => {
      const e = (b.escalonamentos ?? 0) - (a.escalonamentos ?? 0);
      if (e !== 0) return e;
      const p = (a.prioridade ?? 3) - (b.prioridade ?? 3);
      if (p !== 0) return p;
      return (TIPO_ORDEM[a.tipo] ?? 99) - (TIPO_ORDEM[b.tipo] ?? 99);
    });

    if (!lista.length) { vendedoresSemNada++; continue; }

    // Buscar company dos leads
    const leadIds = Array.from(new Set(lista.map((t: any) => t.lead_id).filter(Boolean)));
    const companyById = new Map<string, string>();
    if (leadIds.length) {
      const { data: leads } = await sb.from("leads").select("id, company").in("id", leadIds);
      (leads ?? []).forEach((l: any) => companyById.set(l.id, l.company));
    }

    const lines: string[] = [];
    lines.push(`🤠 *Agenda Xerife* — ${new Date().toLocaleDateString("pt-BR")}`);
    lines.push(`${lista.length} tarefa(s) para hoje${lista.length >= meta ? " ✅" : ` (meta ${meta})`}`);
    lines.push("");
    lista.slice(0, 20).forEach((t: any, i: number) => {
      const co = t.lead_id ? companyById.get(t.lead_id) ?? "" : "";
      const flag = (t.escalonamentos ?? 0) > 0 ? "🔥 " : "";
      lines.push(`${i + 1}. ${flag}${t.title}${co && !t.title.includes(co) ? ` — ${co}` : ""}`);
      if (t.lead_id) lines.push(`   ${crmLeadLink(t.lead_id)}`);
    });
    if (lista.length > 20) lines.push(`\n… e mais ${lista.length - 20}.`);

    const ok = await notifyOwner(uid, lines.join("\n"));
    if (ok) {
      vendedoresNotificados++;
      totalTarefas += lista.length;
      await logAction(sb, {
        regra: "agenda_diaria",
        vendedorId: uid,
        acao: "agenda enviada",
        payload: { total: lista.length, antecipadas, meta },
      });
    }
  }

  // Heartbeat: sempre grava uma linha por execução (mesmo sem envio)
  await logAction(sb, {
    regra: "agenda_diaria",
    acao: `agenda → ${vendedoresNotificados} enviada(s), ${totalTarefas} tarefa(s), ${vendedoresSemNada}/${vendedoresProcessados} sem nada`,
    payload: { vendedoresNotificados, totalTarefas, antecipadas, vendedoresSemNada, vendedoresProcessados },
  });

  return { vendedoresNotificados, totalTarefas, antecipadas };
}

export const Route = createFileRoute("/api/public/hooks/xerife-agenda-diaria")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const isCron = request.headers.get("apikey") === process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("x-xerife-secret");
        const expected = process.env.XERIFE_SECRET;
        if (!isCron && (!expected || provided !== expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const r = await runAgendaDiaria(force);
          return Response.json({ ok: true, at: new Date().toISOString(), ...r });
        } catch (e) {
          console.error("[xerife-agenda-diaria]", e);
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});

export { runAgendaDiaria };
