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
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAction } from "@/lib/xerife/dedupe.server";
import { notifyDiretoria } from "@/lib/xerife/notify.server";
import {
  etapasComCadencia,
  passoCadencia,
  resolverExcecao,
  textoCadencia,
  type CadenciaExcecao,
} from "@/lib/pedidos-cadencia";
import {
  destinatariosFinanceiro,
  destinatariosOperacional,
  notificarUsuarios,
} from "@/lib/pedidos-fluxo.server";
import { stageLabel } from "@/lib/pedidos-stages";
import {
  deveEscalarFinanceiro,
  ESCALONAMENTO_FINANCEIRO_REPETE_HORAS,
} from "@/lib/xerife/escalonamento-financeiro";
import { usuariosComPermissao } from "@/lib/pedidos-fluxo.server";
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";

type SB = SupabaseClient<any, any, any>;

// ────────────── SLA por etapa operacional (dias corridos) ──────────────
// Defaults sensatos; não vieram da xerife_config nesta fase (aditivo futuro).
const SLA_STAGE_DIAS: Record<string, number> = {
  // Fluxo atual
  analise_financeira: 1,
  aguardando_pagamento: 5,
  programacao: 1,
  pronto: 2,
  faturado_em_rota: 3,
  // Etapas legadas
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
async function hasOpenTaskForPedido(sb: SB, pedidoId: string, tipo: string): Promise<boolean> {
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
  /** Desliga o guard genérico por (pedido, tipo) — usado pela cadência,
   *  que já deduplica por (regra, pedido, dono) e é multi-destinatário. */
  checarTarefaAberta?: boolean;
};

type Stats = {
  stage_travado: number;
  cadencia_toques: number;
  cadencia_escalado_gestao: number;
  cadencia_escalado_diretoria: number;
  aprovacao_pendente: number;
  nf_atrasada: number;
  previsao_atrasada: number;
  ocorrencia_aberta: number;
  pos_venda_entrega: number;
  pos_venda_recompra: number;
  financeiro_escalado: number;
  skipped_dedupe: number;
};

async function runXerifePedidos(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ ran: boolean; stats: Stats; dryRun: boolean }> {
  const dryRun = opts.dryRun ?? false;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

  const stats: Stats = {
    stage_travado: 0,
    cadencia_toques: 0,
    cadencia_escalado_gestao: 0,
    cadencia_escalado_diretoria: 0,
    aprovacao_pendente: 0,
    nf_atrasada: 0,
    previsao_atrasada: 0,
    ocorrencia_aberta: 0,
    pos_venda_entrega: 0,
    pos_venda_recompra: 0,
    financeiro_escalado: 0,
    skipped_dedupe: 0,
  };

  const now = new Date();

  async function criarTarefa(t: CriarTarefaArgs): Promise<boolean> {
    if (await alreadyActedPedido(sb, t.regra, t.pedidoId, t.janelaHoras ?? DEDUPE_HORAS_PADRAO)) {
      stats.skipped_dedupe++;
      return false;
    }
    if ((t.checarTarefaAberta ?? true) && (await hasOpenTaskForPedido(sb, t.pedidoId, t.tipo))) {
      stats.skipped_dedupe++;
      return false;
    }
    if (dryRun) return true;
    // Marcador do pedido na descrição para o hasOpenTaskForPedido conseguir dedupe
    const descricaoComTag = `[pedido:${t.pedidoId}] ${t.descricao}`;
    // REGISTRAR E SEGUIR: cron de pedidos; a regra é reavaliada na próxima
    // rodada, mas a falha precisa aparecer em /falhas.
    const insTarefa = await sb.from("tarefas").insert({
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
    if (insTarefa?.error) {
      await registrarFalhaSegura("xerife-pedidos.criarTarefa", insTarefa.error, {
        regra: t.regra,
        pedido_id: t.pedidoId,
      });
    }
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

  // ─────────────── R1: Cadência automática por etapa (com escalonamento) ───────────────
  // Régua por etapa (ver src/lib/pedidos-cadencia.ts):
  //   1º toque → tarefa para o grupo responsável;
  //   2º toque → tarefa + notificação na tela (gestão enxerga);
  //   3º toque → tudo acima + alerta na diretoria.
  {
    const stages = etapasComCadencia();
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, stage, updated_at, responsavel_atual_id, vendedor_proprietario_id, lead_id",
      )
      .in("stage", stages as any)
      .limit(500);

    // Exceções de cadência (por cliente / por família de produto) — carregadas
    // uma vez por execução. Sem exceção aplicável, vale a régua padrão.
    const { data: excData } = await sb
      .from("cadencia_excecoes")
      .select("escopo, cliente_id, familia, stage, dias, escalar_diretoria, ativo")
      .eq("ativo", true);
    const excecoes = (excData ?? []) as unknown as CadenciaExcecao[];
    const temExcCliente = excecoes.some((e) => e.escopo === "cliente");
    const temExcFamilia = excecoes.some((e) => e.escopo === "familia");

    // cliente do pedido (via lead) e famílias dos itens, só se houver exceções
    const clienteDoLead = new Map<string, string | null>();
    async function clienteDoPedido(leadId: string | null): Promise<string | null> {
      if (!temExcCliente || !leadId) return null;
      if (clienteDoLead.has(leadId)) return clienteDoLead.get(leadId) ?? null;
      const { data } = await sb.from("leads").select("cliente_id").eq("id", leadId).maybeSingle();
      const cid = (data?.cliente_id as string | null) ?? null;
      clienteDoLead.set(leadId, cid);
      return cid;
    }
    async function familiasDoPedido(pedidoId: string): Promise<string[]> {
      if (!temExcFamilia) return [];
      const { data: itens } = await sb
        .from("pedido_itens")
        .select("product_id")
        .eq("pedido_id", pedidoId);
      const ids = Array.from(
        new Set((itens ?? []).map((i) => i.product_id).filter((x): x is string => !!x)),
      );
      if (!ids.length) return [];
      const { data: prods } = await sb.from("produtos").select("family").in("id", ids);
      return (prods ?? []).map((p) => (p.family ?? "").trim()).filter((f) => f !== "");
    }

    // Grupos resolvidos uma vez por execução (evita N+1 de permissões)
    let financeiro: string[] | null = null;
    let operacional: string[] | null = null;
    const grupoDe = async (grupo: string, fallbackOwner: string | null): Promise<string[]> => {
      if (grupo === "financeiro") {
        financeiro ??= await destinatariosFinanceiro(sb);
        return financeiro;
      }
      if (grupo === "operacional") {
        operacional ??= await destinatariosOperacional(sb);
        return operacional;
      }
      return fallbackOwner ? [fallbackOwner] : [];
    };

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

      const override = excecoes.length
        ? resolverExcecao(excecoes, {
            stage: p.stage as string,
            clienteId: await clienteDoPedido(p.lead_id ?? null),
            familias: await familiasDoPedido(p.id),
          })
        : null;

      const passo = passoCadencia(p.stage as string, dias, override);
      if (!passo) continue;

      const label = stageLabel(p.stage as string);
      const texto = textoCadencia(passo, { numero: p.number, label, dias });
      const vendedor = p.vendedor_proprietario_id ?? p.responsavel_atual_id ?? null;
      const responsaveis = await grupoDe(
        passo.grupo,
        p.responsavel_atual_id ?? p.vendedor_proprietario_id ?? null,
      );
      const alvos = responsaveis.length
        ? responsaveis
        : ([p.responsavel_atual_id ?? p.vendedor_proprietario_id].filter(Boolean) as string[]);

      // Uma tarefa por responsável do grupo; dedupe por (regra, pedido, dono).
      let criou = false;
      for (const ownerId of alvos) {
        const ok = await criarTarefa({
          regra: `pedido_cadencia:${p.stage}:D${passo.passo}:${ownerId}`,
          pedidoId: p.id,
          pedidoNumber: p.number,
          leadId: p.lead_id ?? null,
          ownerId,
          tipo: passo.tipo,
          titulo: texto.titulo,
          descricao: texto.descricao,
          motivo: `Cadência ${passo.regua.join("/")}d na etapa ${p.stage} — toque ${passo.nivel}`,
          prioridade: texto.prioridade,
          janelaHoras: 22,
          checarTarefaAberta: false,
        });
        criou = criou || ok;
      }
      if (!criou) continue;

      stats.cadencia_toques++;
      stats.stage_travado++;

      if (passo.escalarGestao && !dryRun) {
        const notificar = Array.from(new Set([...alvos, vendedor].filter(Boolean) as string[]));
        await notificarUsuarios(sb, notificar, {
          tipo: `cadencia_${p.stage}_n${passo.nivel}`,
          titulo: texto.titulo,
          pedidoId: p.id,
        });
        stats.cadencia_escalado_gestao++;
      }

      if (passo.escalarDiretoria) {
        stats.cadencia_escalado_diretoria++;
        if (!dryRun) {
          await notifyDiretoria(
            `🚨 Pedido travado — cadência esgotada\n\nPedido: ${p.number}\nEtapa: ${label}\nParado há: ${dias} dias\nAção pendente: ${passo.acao}`,
          );
          await logAction(sb, {
            regra: `pedido_cadencia_diretoria:${p.stage}`,
            leadId: p.lead_id ?? null,
            vendedorId: vendedor,
            acao: "diretoria notificada",
            payload: { pedido_id: p.id, pedido_number: p.number, dias, regua: passo.regua },
          });
        }
      }
    }
  }

  // ─────────────── R2: Aprovação pendente há +24h ───────────────
  {
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, aprovacao_solicitada_em, aprovacao_decidida_em, responsavel_atual_id, vendedor_proprietario_id, lead_id, stage",
      )
      .in("stage", ["analise_financeira", "aguardando_pagamento"] as any)
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
    const alvoInicio = new Date(
      now.getTime() - (POS_VENDA_ENTREGA_DIAS + 1) * 86400_000,
    ).toISOString();
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
    const alvoInicio = new Date(
      now.getTime() - (POS_VENDA_RECOMPRA_DIAS + 1) * 86400_000,
    ).toISOString();
    const alvoFim = new Date(now.getTime() - POS_VENDA_RECOMPRA_DIAS * 86400_000).toISOString();
    const { data: pedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, stage, updated_at, vendedor_proprietario_id, responsavel_atual_id, lead_id",
      )
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

  // ─────────────── R8: Escalonamento financeiro (elimina ponto único de falha) ───────────────
  // Pedido em `analise_financeira` sem decisão há +24h → avisa quem tem
  // `usuarios.gerenciar` (mesmo critério do `alertarAdmins`) com aceite
  // obrigatório + mensagem no grupo da diretoria. Repete no máx. 1x/24h por
  // pedido (dedupe do xerife_log) e para sozinho quando há decisão/mudança de
  // etapa. Nada aqui altera as regras de aprovação nem quem aprova.
  {
    const { data: pedidos, error: errPedidos } = await sb
      .from("pedidos")
      .select(
        "id, number, stage, total, updated_at, aprovacao_decisao, aprovacao_solicitada_em, lead_id, vendedor_proprietario_id, responsavel_atual_id",
      )
      .eq("stage", "analise_financeira" as any)
      .is("aprovacao_decisao", null)
      .limit(500);
    if (errPedidos) {
      await registrarFalhaSegura("xerife-pedidos.escalonamento_financeiro.listar", errPedidos);
    }

    let gestores: string[] | null = null;

    for (const p of pedidos ?? []) {
      // Fonte da entrada na etapa: histórico > aprovacao_solicitada_em > updated_at.
      const { data: hist } = await sb
        .from("pedido_stage_history")
        .select("created_at")
        .eq("pedido_id", p.id)
        .eq("to_stage", "analise_financeira" as any)
        .order("created_at", { ascending: false })
        .limit(1);
      const entrou = hist?.[0]?.created_at ?? p.aprovacao_solicitada_em ?? p.updated_at ?? null;

      const decisao = deveEscalarFinanceiro(
        {
          stage: p.stage as string,
          aprovacao_decisao: (p.aprovacao_decisao as string | null) ?? null,
          entrou_na_etapa_em: entrou,
        },
        now,
      );
      if (!decisao.escalar) continue;

      // Dedupe de 24h por pedido (mesmo mecanismo das outras regras).
      const regra = "pedido_financeiro_escalado";
      if (await alreadyActedPedido(sb, regra, p.id, ESCALONAMENTO_FINANCEIRO_REPETE_HORAS)) {
        stats.skipped_dedupe++;
        continue;
      }
      if (dryRun) {
        stats.financeiro_escalado++;
        continue;
      }

      // Nome do cliente (via lead) — só para o texto do alerta.
      let cliente = "cliente não informado";
      if (p.lead_id) {
        const { data: lead } = await sb
          .from("leads")
          .select("company, contact_name")
          .eq("id", p.lead_id)
          .maybeSingle();
        cliente = (lead?.company || lead?.contact_name || cliente) as string;
      }
      const valor = Number(p.total ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const titulo = `Pedido ${p.number} parado em análise financeira há ${decisao.horasParado}h — ${cliente} — ${valor}`;

      gestores ??= await usuariosComPermissao(sb, "usuarios.gerenciar");

      // Falha em um destinatário não pode impedir os outros nem derrubar o job:
      // cada inserção é isolada e apenas registrada.
      let enviados = 0;
      for (const userId of gestores) {
        try {
          const ins = await sb.from("notificacoes").insert({
            user_id: userId,
            tipo: regra,
            titulo: titulo.slice(0, 300),
            pedido_id: p.id,
            exige_aceite: true,
          });
          await assertNoError(ins, "xerife-pedidos.escalonamento_financeiro.notificar", {
            pedido_id: p.id,
            user_id: userId,
          });
          enviados++;
        } catch (e) {
          console.error("[xerife-pedidos] escalonamento financeiro (in-app):", e);
        }
      }

      // Telegram da diretoria — efeito secundário: registrar e seguir.
      try {
        await notifyDiretoria(
          `⚠️ Pedido parado em análise financeira\n\nPedido: ${p.number}\nCliente: ${cliente}\nValor: ${valor}\nSem decisão há: ${decisao.horasParado}h`,
        );
      } catch (e) {
        await registrarFalhaSegura("xerife-pedidos.escalonamento_financeiro.telegram", e, {
          pedido_id: p.id,
        });
      }

      await logAction(sb, {
        regra,
        leadId: p.lead_id ?? null,
        vendedorId: p.vendedor_proprietario_id ?? p.responsavel_atual_id ?? null,
        acao: "escalonamento financeiro enviado",
        payload: {
          pedido_id: p.id,
          pedido_number: p.number,
          horas: decisao.horasParado,
          destinatarios: enviados,
        },
      });
      stats.financeiro_escalado++;
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
        const denied = await requireXerifeCronAuth(request);
        if (denied) return denied;
        try {
          const r = await runXerifePedidos({ force: false, dryRun: false });
          return cronJsonResponse(r);
        } catch (e) {
          console.error("[xerife-pedidos]", e);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

export { runXerifePedidos };
