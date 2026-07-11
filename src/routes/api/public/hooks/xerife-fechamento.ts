/**
 * Xerife — Fechamento (18:00 SP dias úteis).
 * Rola tarefas pendentes de hoje para amanhã (escalonamentos+1, prioridade-1 mínimo 1).
 * Envia placar do dia para vendedor + consolidado para diretoria.
 * Idempotente: xerife_log regra='fechamento' + janela 20h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { alreadyActed, logAction } from "@/lib/xerife/dedupe.server";
import { notifyOwner, notifyDiretoria } from "@/lib/xerife/notify.server";

// Timezone-aware helpers (America/Sao_Paulo, UTC-3 fixo)
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
function spNow(): Date { return new Date(Date.now() + SP_OFFSET_MS); }
function endOfTodaySpIso(): string {
  const sp = spNow();
  // fim do dia em SP → volta pro instante UTC correspondente
  const endSp = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 23, 59, 59, 999);
  return new Date(endSp - SP_OFFSET_MS).toISOString();
}
function startOfTodaySpIso(): string {
  const sp = spNow();
  const startSp = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 0, 0, 0, 0);
  return new Date(startSp - SP_OFFSET_MS).toISOString();
}
/** Próximo dia útil às 09:00 BRT (pula sáb/dom). */
function nextBusinessDay9amIso(): string {
  const sp = spNow();
  let y = sp.getUTCFullYear(), m = sp.getUTCMonth(), d = sp.getUTCDate() + 1;
  // avança até seg-sex
  for (let i = 0; i < 7; i++) {
    const probe = new Date(Date.UTC(y, m, d, 12, 0, 0)); // meio-dia UTC evita virada de dia
    const dow = probe.getUTCDay(); // 0 dom, 6 sáb
    if (dow !== 0 && dow !== 6) break;
    d += 1;
  }
  const target = Date.UTC(y, m, d, 9, 0, 0, 0); // 09:00 em SP
  return new Date(target - SP_OFFSET_MS).toISOString();
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

  // Top 3 do Placar de Vendedores (fonte única) + notificação de faixa de meta
  const faixasCruzadasGrupo: { nome: string; faixa: number }[] = [];
  try {
    const { data: rankRows } = await sb.rpc("placar_vendedores" as any, { _periodo: "mes" });
    const rows = ((rankRows ?? []) as any[]);
    const top3 = rows.filter((r) => Number(r.score) > 0).slice(0, 3);
    if (top3.length) {
      dLines.push("");
      dLines.push("🏆 *Placar do mês*");
      const medals = ["🥇", "🥈", "🥉"];
      top3.forEach((r, i) => {
        dLines.push(`${medals[i]} ${r.nome} — ${Number(r.score).toFixed(0)} pts`);
      });
    }

    // Faixas de meta atingidas hoje (50/80/100/120) — dedupe por xerife_log
    for (const r of rows) {
      const faixa = Number(r.meta_faixa ?? 0);
      if (![50, 80, 100, 120].includes(faixa)) continue;
      const regra = `meta_faixa_${faixa}`;
      // dedupe por (regra, vendedor_id) na janela de 30 dias — evita re-notificar no mesmo mês
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { count: already } = await sb
        .from("xerife_log")
        .select("id", { count: "exact", head: true })
        .eq("regra", regra)
        .eq("vendedor_id", r.vendedor_id)
        .gte("created_at", since);
      if ((already ?? 0) > 0) continue;

      const meta = Number(r.meta_valor ?? 0);
      const ganho = Number(r.ganhos_valor ?? 0);
      const pct = Number(r.meta_pct ?? 0);
      const faltando = Math.max(0, meta - ganho);
      const emoji = faixa === 120 ? "🚀" : faixa === 100 ? "🎯" : faixa === 80 ? "🔥" : "📈";
      const titulo = faixa === 120 ? "Superou a meta em 120%!"
        : faixa === 100 ? "Meta batida!"
        : faixa === 80  ? "80% da meta atingida"
        :                 "50% da meta atingida";
      const linhasVendedor = [
        `${emoji} *${titulo}*`,
        `Você está em *${pct.toFixed(0)}%* da meta do mês.`,
        `Fechado: ${brl(ganho)} · Meta: ${brl(meta)}`,
        faixa >= 100 ? "Parabéns! 🎉" : `Faltam ${brl(faltando)} para bater 100%.`,
      ];
      await notifyOwner(r.vendedor_id, linhasVendedor.join("\n"));
      // Para o grupo/diretoria: SEM valores em R$ — só nome + faixa em %
      faixasCruzadasGrupo.push({ nome: r.nome, faixa });
      await logAction(sb, { regra, vendedorId: r.vendedor_id, acao: "notificado", payload: { faixa, pct } });
    }
  } catch (e) {
    console.error("[xerife-fechamento] placar_vendedores falhou:", e);
  }

  if (faixasCruzadasGrupo.length) {
    dLines.push("");
    dLines.push("🎯 *Faixas de meta batidas hoje*");
    faixasCruzadasGrupo
      .sort((a, b) => b.faixa - a.faixa)
      .forEach((f) => {
        const emoji = f.faixa === 120 ? "🚀" : f.faixa === 100 ? "🎯" : f.faixa === 80 ? "🔥" : "📈";
        dLines.push(`${emoji} ${f.nome} — ${f.faixa}%`);
      });
  }

  // Último dia útil do mês → snapshot do histórico
  try {
    if (isUltimoDiaUtilDoMes(new Date())) {
      const now = new Date();
      const spOffsetMs = -3 * 60 * 60 * 1000; // aprox SP UTC-3
      const sp = new Date(now.getTime() + spOffsetMs);
      const ano = sp.getUTCFullYear();
      const mes = sp.getUTCMonth() + 1;
      const { data: n } = await sb.rpc("snapshot_metas_mes" as any, { _ano: ano, _mes: mes });
      console.log("[xerife-fechamento] snapshot mês", ano, mes, "→", n);
    }
  } catch (e) {
    console.error("[xerife-fechamento] snapshot_metas_mes falhou:", e);
  }

  if (placarPorVendedor.length) diretoriaNotificada = await notifyDiretoria(dLines.join("\n"));

  return { vendedoresNotificados, tarefasRoladas, diretoriaNotificada };
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Último dia útil do mês (seg–sex, sem feriados). */
function isUltimoDiaUtilDoMes(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const month = d.getMonth();
  // varre próximos dias úteis dentro do mesmo mês
  const probe = new Date(d);
  for (let i = 1; i <= 4; i++) {
    probe.setDate(probe.getDate() + 1);
    const pdow = probe.getDay();
    if (pdow === 0 || pdow === 6) continue;
    // achou próximo dia útil — se for outro mês, hoje é o último útil
    return probe.getMonth() !== month;
  }
  return false;
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
