/**
 * Xerife Operacional (Pedidos) — Fase 6.
 *
 * SEGURANÇA: NÃO envia WhatsApp (nem interno, nem a cliente).
 * Apenas cria TAREFAS internas no CRM (origem='xerife') e grava xerife_log
 * para auditoria/idempotência. Comunicação fica fora desta fase.
 *
 * Preserva integralmente o xerife-engine (funil comercial) e cadências
 * existentes. Este engine roda em paralelo, apenas sobre a tabela `pedidos`.
 *
 * Idempotente: dedupe por (regra, pedido_id) via xerife_log com janela por regra.
 * Rodar 2x seguidas nunca duplica tarefa.
 */
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAction } from "@/lib/xerife/dedupe.server";

type SB = SupabaseClient<any, any, any>;

// ────────────── SLA por etapa operacional (dias corridos) ──────────────
// Defaults sensatos; não vieram da xerife_config nesta fase (aditivo futuro).
const SLA_STAGE_DIAS: Record<string, number> = {
  em_validacao: 1,
  aguardando_aprovacao: 1,
  aprovado_programado: 2,
  em_producao: 5,
  separacao_conferencia: 1,
  faturado_aguardando_coleta: 2,
  despachado_transporte: 5,
  pedido_entregue: 3,
};

const APROVACAO_SLA_HORAS = 24;
const NF_ATRASO_DIAS = 2;
const OCORRENCIA_SLA_HORAS = 24;
const POS_VENDA_ENTREGA_DIAS = 3;
const POS_VENDA_RECOMPRA_DIAS = 30;

// Janela de dedupe em xerife_log (horas) para não recriar a mesma tarefa
const DEDUPE_HORAS_PADRAO = 24;

function diasDesde(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400_000));
}
function horasDesde(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3600_000));
}

async function alreadyActedPedido(
  sb: SB,
  regra: string,
  pedidoId: string,
  janelaHoras = DEDUPE_HORAS_PADRAO,
): Promise<boolean> {
  const sinceIso = new Date(Date.now() - janelaHoras * 3600 * 1000).toISOString();
  const { count } = await sb
    .from("xerife_log")
    .select("id", { count: "exact", head: true })
    .eq("regra", regra)
    .gte("created_at", sinceIso)
    .filter("payload->>pedido_id", "eq", pedidoId);
  return (count ?? 0) > 0;
}

/** Já existe tarefa pendente para este pedido com este tipo? (defesa extra) */
async function hasOpenTaskForPedido(
  sb: SB,
  pedidoId: string,
  tipo: string,
): Promise<boolean> {
  const { count } = await sb
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("tipo", tipo)
    .in("status", ["pendente", "adiada"])
    .filter("descricao", "ilike", `%${pedidoId}%`);
  return (count ?? 0) > 0;
}

type CriarTarefaArgs = {
  regra: string;
  pedidoId: string;
  pedidoNumber: string;
  leadId: string | null;
  ownerId: string | null;
  tipo: string;
  titulo: string;
  descricao: string;
  motivo: string;
  prioridade: number;
  janelaHoras?: number;
  dueDate?: Date;
};

type Stats = {
  stage_travado: number;
  aprovacao_pendente: number;
  nf_atrasada: number;
  previsao_atrasada: number;
  ocorrencia_aberta: number;
  pos_venda_entrega: number;
  pos_venda_recompra: number;
  skipped_dedupe: number;
};

async function runXerifePedidos(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ ran: boolean; stats: Stats; dryRun: boolean }> {
  const dryRun = opts.dryRun ?? false;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

  const stats: Stats = {
    stage_travado: 0,
    aprovacao_pendente: 0,
    nf_atrasada: 0,
    previsao_atrasada: 0,
    ocorrencia_aberta: 0,
    pos_venda_entrega: 0,
    pos_venda_recompra: 0,
    skipped_dedupe: 0,
  };

  const now = new Date();

  async function criarTarefa(t: CriarTarefaArgs): Promise<boolean> {
    if (await alreadyActedPedido(sb, t.regra, t.pedidoId, t.janelaHoras ?? DEDUPE_HORAS_PADRAO)) {
      stats.skipped_dedupe++;
      return false;
    }
    if (await hasOpenTaskForPedido(sb, t.pedidoId, t.tipo)) {
      stats.skipped_dedupe++;
      return false;
    }
    if (dryRun) return true;
    // Marcador do pedido na descrição para o hasOpenTaskForPedido conseguir dedupe
    const descricaoComTag = `[pedido:${t.pedidoId}] ${t.descricao}`;
    await sb.from("tarefas").insert({
      lead_id: t.leadId,
      owner_id: t.ownerId,
      title: t.titulo,
      descricao: descricaoComTag,
      tipo: t.tipo,
      kind: t.tipo,
      prioridade: t.prioridade,
      due_date: (t.dueDate ?? new Date(Date.now() + 2 * 3600 * 1000)).toISOString(),
      status: "pendente",
      origem: "xerife",
    });
    await logAction(sb, {
      regra: t.regra,
      leadId: t.leadId,
      vendedorId: t.ownerId,
      acao: t.titulo,
      payload: {
        pedido_id: t.pedidoId,
        pedido_number: t.pedidoNumber,
        motivo: t.motivo,
        tipo: t.tipo,
      },
    });
    return true;
  }

  // ─────────────── R1: Pedido travado em etapa ───────────────
  {
    const stages = Object.keys(SLA_STAGE_DIAS);
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, stage, updated_at, responsavel_atual_id, vendedor_proprietario_id, lead_id",
      )
      .in("stage", stages as any)
      .limit(500);

    // stage_changed_at não existe em pedidos; usamos etapa mais recente do histórico
    for (const p of pedidos ?? []) {
      const { data: hist } = await sb
        .from("pedido_stage_history")
        .select("created_at")
        .eq("pedido_id", p.id)
        .eq("to_stage", p.stage as any)
        .order("created_at", { ascending: false })
        .limit(1);
      const desde = hist?.[0]?.created_at ?? p.updated_at;
      const dias = diasDesde(desde, now) ?? 0;
      const sla = SLA_STAGE_DIAS[p.stage] ?? 999;
      if (dias < sla) continue;

      const owner = p.responsavel_atual_id ?? p.vendedor_proprietario_id;
      const ok = await criarTarefa({
        regra: `pedido_stage_travado:${p.stage}`,
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "pedido_travado",
        titulo: `Pedido ${p.number} parado em "${p.stage}" há ${dias}d`,
        descricao: `Pedido ${p.number} está em ${p.stage} há ${dias} dias (SLA ${sla}d). Verifique e mova adiante.`,
        motivo: `SLA de etapa ${p.stage} = ${sla}d, real ${dias}d`,
        prioridade: 2,
      });
      if (ok) stats.stage_travado++;
    }
  }

  // ─────────────── R2: Aprovação pendente há +24h ───────────────
  {
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, aprovacao_solicitada_em, aprovacao_decidida_em, responsavel_atual_id, vendedor_proprietario_id, lead_id, stage",
      )
      .eq("stage", "aguardando_aprovacao" as any)
      .not("aprovacao_solicitada_em", "is", null)
      .is("aprovacao_decidida_em", null)
      .limit(500);

    for (const p of pedidos ?? []) {
      const horas = horasDesde(p.aprovacao_solicitada_em, now) ?? 0;
      if (horas < APROVACAO_SLA_HORAS) continue;
      const owner = p.responsavel_atual_id ?? p.vendedor_proprietario_id;
      const ok = await criarTarefa({
        regra: "pedido_aprovacao_pendente",
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "aprovacao_pendente",
        titulo: `Aprovação pendente há ${horas}h — Pedido ${p.number}`,
        descricao: `Aprovação solicitada há ${horas}h sem decisão. Escalar para admin/diretoria internamente.`,
        motivo: `Aprovação sem decisão há ${horas}h (SLA ${APROVACAO_SLA_HORAS}h)`,
        prioridade: 1,
      });
      if (ok) stats.aprovacao_pendente++;
    }
  }

  // ─────────────── R3: NF atrasada em faturado_aguardando_coleta ───────────────
  {
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, updated_at, nf_numero, responsavel_atual_id, vendedor_proprietario_id, lead_id",
      )
      .eq("stage", "faturado_aguardando_coleta" as any)
      .is("nf_numero", null)
      .limit(500);

    for (const p of pedidos ?? []) {
      const dias = diasDesde(p.updated_at, now) ?? 0;
      if (dias < NF_ATRASO_DIAS) continue;
      const owner = p.responsavel_atual_id ?? p.vendedor_proprietario_id;
      const ok = await criarTarefa({
        regra: "pedido_nf_atrasada",
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "nf_atrasada",
        titulo: `NF não emitida — Pedido ${p.number} (${dias}d)`,
        descricao: `Pedido em Faturado/Aguard. Coleta há ${dias}d sem NF. Verifique com fiscal.`,
        motivo: `NF ausente há ${dias}d (SLA ${NF_ATRASO_DIAS}d)`,
        prioridade: 1,
      });
      if (ok) stats.nf_atrasada++;
    }
  }

  // ─────────────── R4: Previsão de entrega estourada ───────────────
  {
    const hojeIso = now.toISOString();
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, previsao_entrega, stage, responsavel_atual_id, vendedor_proprietario_id, lead_id",
      )
      .not("previsao_entrega", "is", null)
      .lt("previsao_entrega", hojeIso)
      .not("stage", "in", "(pedido_entregue,concluido)" as any)
      .limit(500);

    for (const p of pedidos ?? []) {
      const dias = diasDesde(p.previsao_entrega, now) ?? 0;
      const owner = p.responsavel_atual_id ?? p.vendedor_proprietario_id;
      const ok = await criarTarefa({
        regra: "pedido_previsao_atrasada",
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "previsao_atrasada",
        titulo: `Entrega atrasada ${dias}d — Pedido ${p.number}`,
        descricao: `Previsão de entrega estourada em ${dias}d. Etapa atual: ${p.stage}. Realinhe cliente e transporte.`,
        motivo: `Previsão < hoje, stage ${p.stage}`,
        prioridade: 1,
        janelaHoras: 24,
      });
      if (ok) stats.previsao_atrasada++;
    }
  }

  // ─────────────── R5: Ocorrência aberta há +24h ───────────────
  {
    const sinceIso = new Date(now.getTime() - OCORRENCIA_SLA_HORAS * 3600_000).toISOString();
    const { data: ocorrencias } = await sb
      .from("pedido_ocorrencias")
      .select("id, pedido_id, tipo, severidade, descricao, created_at")
      .eq("resolvida", false)
      .lt("created_at", sinceIso)
      .limit(500);

    const pedidoIds = Array.from(new Set((ocorrencias ?? []).map((o: any) => o.pedido_id)));
    const pedidoMap = new Map<string, any>();
    if (pedidoIds.length) {
      const { data: pedidos } = await sb
        .from("pedidos")
        .select("id, number, responsavel_atual_id, vendedor_proprietario_id, lead_id")
        .in("id", pedidoIds);
      (pedidos ?? []).forEach((p: any) => pedidoMap.set(p.id, p));
    }

    for (const o of ocorrencias ?? []) {
      const p = pedidoMap.get(o.pedido_id);
      if (!p) continue;
      const horas = horasDesde(o.created_at, now) ?? 0;
      const owner = p.responsavel_atual_id ?? p.vendedor_proprietario_id;
      const ok = await criarTarefa({
        regra: `pedido_ocorrencia_aberta:${o.id}`,
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "ocorrencia_aberta",
        titulo: `Ocorrência aberta há ${horas}h — Pedido ${p.number}`,
        descricao: `[${o.severidade ?? "media"}] ${o.tipo}: ${o.descricao ?? ""}`.trim(),
        motivo: `Ocorrência não resolvida há ${horas}h`,
        prioridade: (o.severidade ?? "").toLowerCase() === "alta" ? 1 : 2,
        janelaHoras: 24,
      });
      if (ok) stats.ocorrencia_aberta++;
    }
  }

  // ─────────────── R6: Pós-venda — confirmação de entrega ───────────────
  {
    const alvoInicio = new Date(now.getTime() - (POS_VENDA_ENTREGA_DIAS + 1) * 86400_000).toISOString();
    const alvoFim = new Date(now.getTime() - POS_VENDA_ENTREGA_DIAS * 86400_000).toISOString();
    const { data: pedidos } = await sb
      .from("pedidos")
      .select("id, number, entregue_em, vendedor_proprietario_id, responsavel_atual_id, lead_id")
      .not("entregue_em", "is", null)
      .gte("entregue_em", alvoInicio)
      .lt("entregue_em", alvoFim)
      .limit(500);

    for (const p of pedidos ?? []) {
      const owner = p.vendedor_proprietario_id ?? p.responsavel_atual_id;
      const ok = await criarTarefa({
        regra: "pos_venda_pedido_entregue",
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "pos_venda_confirmacao",
        titulo: `Pós-venda: confirmar entrega — Pedido ${p.number}`,
        descricao: `Pedido entregue há ${POS_VENDA_ENTREGA_DIAS}d. Confirmar recebimento e satisfação com o cliente.`,
        motivo: `+${POS_VENDA_ENTREGA_DIAS}d após entregue_em`,
        prioridade: 2,
        janelaHoras: 24 * 30,
      });
      if (ok) stats.pos_venda_entrega++;
    }
  }

  // ─────────────── R7: Pós-venda — recompra (30d após concluido) ───────────────
  {
    const alvoInicio = new Date(now.getTime() - (POS_VENDA_RECOMPRA_DIAS + 1) * 86400_000).toISOString();
    const alvoFim = new Date(now.getTime() - POS_VENDA_RECOMPRA_DIAS * 86400_000).toISOString();
    const { data: pedidos } = await sb
      .from("pedidos")
      .select("id, number, stage, updated_at, vendedor_proprietario_id, responsavel_atual_id, lead_id")
      .eq("stage", "concluido" as any)
      .gte("updated_at", alvoInicio)
      .lt("updated_at", alvoFim)
      .limit(500);

    for (const p of pedidos ?? []) {
      const owner = p.vendedor_proprietario_id ?? p.responsavel_atual_id;
      const ok = await criarTarefa({
        regra: "pos_venda_pedido_recompra",
        pedidoId: p.id,
        pedidoNumber: p.number,
        leadId: p.lead_id ?? null,
        ownerId: owner,
        tipo: "pos_venda_recompra",
        titulo: `Pós-venda: sondar recompra — Pedido ${p.number}`,
        descricao: `+${POS_VENDA_RECOMPRA_DIAS}d após conclusão. Abrir contato de recompra/renovação.`,
        motivo: `+${POS_VENDA_RECOMPRA_DIAS}d após concluído`,
        prioridade: 3,
        janelaHoras: 24 * 60,
      });
      if (ok) stats.pos_venda_recompra++;
    }
  }

  // Heartbeat de execução
  if (!dryRun) {
    await logAction(sb, {
      regra: "xerife_pedidos_run",
      acao: "engine operacional executado",
      payload: { ...stats, at: now.toISOString() },
    });
  }

  return { ran: true, stats, dryRun };
}

export const Route = createFileRoute("/api/public/hooks/xerife-pedidos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const isCron = request.headers.get("apikey") === process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("x-xerife-secret");
        const expected = process.env.XERIFE_SECRET;
        if (!isCron && (!expected || provided !== expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1";
          const dryRun = url.searchParams.get("dryRun") === "1";
          const r = await runXerifePedidos({ force, dryRun });
          return Response.json({ ok: true, at: new Date().toISOString(), ...r });
        } catch (e) {
          console.error("[xerife-pedidos]", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

export { runXerifePedidos };
