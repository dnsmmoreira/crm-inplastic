/**
 * Xerife — Fechamento (18:00 SP dias úteis).
 * Rola tarefas pendentes de hoje para amanhã (escalonamentos+1, prioridade-1 mínimo 1).
 * Envia placar do dia para vendedor + consolidado para diretoria.
 * Idempotente: xerife_log regra='fechamento' + janela 20h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { alreadyActed, logAction } from "@/lib/xerife/dedupe.server";
import { notifyOwner, notifyDiretoria } from "@/lib/xerife/notify.server";

function startOfTodayIso(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function endOfTodayIso(): string {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString();
}
function tomorrow9amIso(): string {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString();
}

async function runFechamento(force = false): Promise<{
  vendedoresNotificados: number; tarefasRoladas: number; diretoriaNotificada: boolean;
}> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

  if (!force && (await alreadyActed(sb, "fechamento", null, 20))) {
    return { vendedoresNotificados: 0, tarefasRoladas: 0, diretoriaNotificada: false };
  }

  const { data: vendedores } = await sb.from("user_roles").select("user_id").eq("role", "vendedor" as any);

  let vendedoresNotificados = 0;
  let tarefasRoladas = 0;
  let totalFeitasEquipe = 0;
  let totalRoladasEquipe = 0;
  const placarPorVendedor: { name: string; feitas: number; roladas: number }[] = [];

  for (const v of vendedores ?? []) {
    const uid = v.user_id;

    const { data: pendentes } = await sb
      .from("tarefas")
      .select("id, prioridade, escalonamentos")
      .eq("owner_id", uid)
      .in("status", ["pendente", "adiada"])
      .lte("due_date", endOfTodayIso());

    const { count: feitas } = await sb
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", uid)
      .eq("status", "concluida")
      .gte("concluida_at", startOfTodayIso());

    const nRoladas = (pendentes ?? []).length;

    // Rola cada uma
    for (const t of pendentes ?? []) {
      const novaPri = Math.max(1, (t.prioridade ?? 3) - 1);
      await sb
        .from("tarefas")
        .update({
          due_date: tomorrow9amIso(),
          escalonamentos: (t.escalonamentos ?? 0) + 1,
          prioridade: novaPri,
          status: "pendente",
        })
        .eq("id", t.id);
    }
    tarefasRoladas += nRoladas;
    totalRoladasEquipe += nRoladas;
    const nFeitas = feitas ?? 0;
    totalFeitasEquipe += nFeitas;

    const { data: prof } = await sb.from("profiles").select("name").eq("id", uid).maybeSingle();
    placarPorVendedor.push({ name: prof?.name ?? "vendedor", feitas: nFeitas, roladas: nRoladas });

    if (nFeitas === 0 && nRoladas === 0) continue;

    const lines: string[] = [];
    lines.push(`🏁 *Fechamento do dia*`);
    lines.push(`✅ Concluídas: *${nFeitas}*`);
    lines.push(`↪️ Rolaram p/ amanhã: *${nRoladas}*`);
    if (nRoladas === 0) lines.push("\n🏆 Dia limpo! Parabéns.");
    else lines.push("\nAmanhã 07:30 chega sua nova agenda.");
    if (await notifyOwner(uid, lines.join("\n"))) vendedoresNotificados++;
  }

  await logAction(sb, {
    regra: "fechamento", acao: "rollover + placar",
    payload: { tarefasRoladas, vendedoresNotificados },
  });

  // Placar diretoria
  let diretoriaNotificada = false;
  placarPorVendedor.sort((a, b) => b.feitas - a.feitas);
  const dLines: string[] = [];
  dLines.push(`🏁 *Placar Xerife* — ${new Date().toLocaleDateString("pt-BR")}`);
  dLines.push(`Equipe: ✅ ${totalFeitasEquipe} concluídas · ↪️ ${totalRoladasEquipe} roladas`);
  dLines.push("");
  placarPorVendedor.slice(0, 15).forEach((p, i) => {
    dLines.push(`${i + 1}. ${p.name} — ✅ ${p.feitas} · ↪️ ${p.roladas}`);
  });

  // Top 3 do Placar de Vendedores (fonte única)
  try {
    const { data: rankRows } = await sb.rpc("placar_vendedores" as any, { _periodo: "mes" });
    const top3 = ((rankRows ?? []) as any[]).filter((r) => Number(r.score) > 0).slice(0, 3);
    if (top3.length) {
      dLines.push("");
      dLines.push("🏆 *Placar do mês*");
      const medals = ["🥇", "🥈", "🥉"];
      top3.forEach((r, i) => {
        dLines.push(`${medals[i]} ${r.nome} — ${Number(r.score).toFixed(0)} pts`);
      });
    }
  } catch (e) {
    console.error("[xerife-fechamento] placar_vendedores falhou:", e);
  }

  if (placarPorVendedor.length) diretoriaNotificada = await notifyDiretoria(dLines.join("\n"));

  return { vendedoresNotificados, tarefasRoladas, diretoriaNotificada };
}

export const Route = createFileRoute("/api/public/hooks/xerife-fechamento")({
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
          const r = await runFechamento(force);
          return Response.json({ ok: true, at: new Date().toISOString(), ...r });
        } catch (e) {
          console.error("[xerife-fechamento]", e);
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});

export { runFechamento };
