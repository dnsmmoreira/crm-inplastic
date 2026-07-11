/**
 * Xerife — Checkpoint (13:00 SP dias úteis).
 * Resumo do que ainda está pendente hoje para cada vendedor.
 * Idempotente: xerife_log regra='checkpoint' + janela 5h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { alreadyActed, logAction } from "@/lib/xerife/dedupe.server";
import { notifyOwner } from "@/lib/xerife/notify.server";

function endOfTodayIso(): string {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString();
}
function startOfTodayIso(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

async function runCheckpoint(force = false): Promise<{ vendedoresNotificados: number }> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

  if (!force && (await alreadyActed(sb, "checkpoint", null, 5))) {
    return { vendedoresNotificados: 0 };
  }

  const { data: vendedores } = await sb.from("user_roles").select("user_id").eq("role", "vendedor" as any);
  let vendedoresNotificados = 0;
  let vendedoresSemNada = 0;
  const vendedoresProcessados = (vendedores ?? []).length;

  for (const v of vendedores ?? []) {
    const uid = v.user_id;

    const { data: pendentes } = await sb
      .from("tarefas")
      .select("id, tipo, title, prioridade, escalonamentos")
      .eq("owner_id", uid)
      .in("status", ["pendente", "adiada"])
      .lte("due_date", endOfTodayIso());

    const { data: concluidasHoje } = await sb
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", uid)
      .eq("status", "concluida")
      .gte("concluida_at", startOfTodayIso());

    const pend = pendentes ?? [];
    const feitas = (concluidasHoje as any)?.count ?? 0;
    if (pend.length === 0 && feitas === 0) { vendedoresSemNada++; continue; }

    const criticas = pend.filter((t: any) => (t.prioridade ?? 3) <= 1 || (t.escalonamentos ?? 0) > 0);
    const lines: string[] = [];
    lines.push(`⏱️ *Checkpoint 13h*`);
    lines.push(`✅ Concluídas: *${feitas}*`);
    lines.push(`📋 Pendentes hoje: *${pend.length}*`);
    if (criticas.length) {
      lines.push(`🔥 Críticas: *${criticas.length}*`);
      criticas.slice(0, 5).forEach((t: any) => lines.push(`• ${t.title}`));
    }
    lines.push("\nSegue firme na tarde. 💪");

    if (await notifyOwner(uid, lines.join("\n"))) {
      vendedoresNotificados++;
      await logAction(sb, {
        regra: "checkpoint", vendedorId: uid, acao: "checkpoint enviado",
        payload: { pendentes: pend.length, criticas: criticas.length, concluidas: feitas },
      });
    }
  }

  // Heartbeat: sempre grava uma linha por execução (mesmo sem envio)
  await logAction(sb, {
    regra: "checkpoint",
    acao: `checkpoint → ${vendedoresNotificados} enviado(s), ${vendedoresSemNada}/${vendedoresProcessados} sem nada`,
    payload: { vendedoresNotificados, vendedoresSemNada, vendedoresProcessados },
  });

  return { vendedoresNotificados };
}

export const Route = createFileRoute("/api/public/hooks/xerife-checkpoint")({
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
          const r = await runCheckpoint(force);
          return Response.json({ ok: true, at: new Date().toISOString(), ...r });
        } catch (e) {
          console.error("[xerife-checkpoint]", e);
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});

export { runCheckpoint };
