/**
 * Fluxo operacional de pedidos — efeitos colaterais server-only:
 * notificações na tela (sino), tarefas automáticas e motor de regras de
 * aprovação financeira alimentado por `arena_config`.
 *
 * NUNCA envia WhatsApp/Telegram. Apenas grava em `notificacoes` e `tarefas`.
 */
import {
  decidirRotaAprovacao,
  APROVACAO_PARAMS_PADRAO,
  type AprovacaoDecisao,
  type AprovacaoParams,
} from "@/lib/pedidos-stages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export const TAREFA_TIPO_ACOMPANHAR_PRODUCAO = "acompanhar_producao";
export const TAREFA_TIPO_POS_VENDA_PEDIDO = "pos_venda_pedido";
export const TAREFA_TIPO_APROVACAO_PENDENTE = "aprovacao_pendente";
export const TAREFA_TIPO_AGUARDANDO_PAGAMENTO = "aguardando_pagamento";

/** Tarefas de etapa financeira — concluídas automaticamente ao sair da etapa. */
export const TAREFAS_ETAPA_FINANCEIRA = [
  TAREFA_TIPO_APROVACAO_PENDENTE,
  TAREFA_TIPO_AGUARDANDO_PAGAMENTO,
];

/* ------------------------------------------------------------------ */
/* Destinatários                                                       */
/* ------------------------------------------------------------------ */

async function usuariosDoPerfil(sb: SB, nome: string): Promise<string[]> {
  const { data: perfil } = await sb.from("perfis").select("id").eq("nome", nome).maybeSingle();
  if (!perfil?.id) return [];
  const { data } = await sb.from("user_perfis").select("user_id").eq("perfil_id", perfil.id);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/** Usuários ativos cujo perfil ativo concede a permissão informada. */
async function usuariosComPermissao(sb: SB, chave: string): Promise<string[]> {
  const { data: vinculos } = await sb
    .from("perfil_permissoes")
    .select("perfil_id")
    .eq("permissao_chave", chave);
  const perfilIds = Array.from(
    new Set(((vinculos ?? []) as Array<{ perfil_id: string }>).map((r) => r.perfil_id)),
  );
  if (perfilIds.length === 0) return [];
  const { data: perfis } = await sb.from("perfis").select("id").in("id", perfilIds).eq("ativo", true);
  const ativos = ((perfis ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ativos.length === 0) return [];
  const { data: users } = await sb.from("user_perfis").select("user_id").in("perfil_id", ativos);
  const userIds = Array.from(
    new Set(((users ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
  );
  if (userIds.length === 0) return [];
  const { data: profs } = await sb
    .from("profiles")
    .select("id")
    .in("id", userIds)
    .eq("ativo", true)
    .is("deleted_at", null);
  return ((profs ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Quem opera pedido = quem tem a permissão `pedidos.movimentar`.
 * Não usa `user_roles.role = 'admin'`: perfis com base_role admin criados por
 * outras razões (ex.: Gestor Comercial, que enxerga representantes) não devem
 * receber tarefa de liberação financeira.
 */
export async function destinatariosFinanceiro(sb: SB): Promise<string[]> {
  return usuariosComPermissao(sb, "pedidos.movimentar");
}

export async function destinatariosOperacional(sb: SB): Promise<string[]> {
  return Array.from(new Set(await usuariosDoPerfil(sb, "Operacional Comercial")));
}

/* ------------------------------------------------------------------ */
/* Notificações na tela                                                */
/* ------------------------------------------------------------------ */

export async function notificarUsuarios(
  sb: SB,
  userIds: string[],
  args: { tipo: string; titulo: string; pedidoId: string },
): Promise<number> {
  const alvos = Array.from(new Set(userIds.filter(Boolean)));
  if (alvos.length === 0) return 0;
  const { error } = await sb.from("notificacoes").insert(
    alvos.map((user_id) => ({
      user_id,
      tipo: args.tipo,
      titulo: args.titulo.slice(0, 300),
      pedido_id: args.pedidoId,
    })),
  );
  if (error) {
    console.error("[pedidos-fluxo] falha ao notificar:", error.message);
    return 0;
  }
  return alvos.length;
}

/* ------------------------------------------------------------------ */
/* Tarefas automáticas                                                 */
/* ------------------------------------------------------------------ */

/** Soma dias ÚTEIS (seg–sex) a uma data. */
export function addDiasUteis(base: Date, dias: number): Date {
  const d = new Date(base.getTime());
  let restantes = dias;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) restantes--;
  }
  return d;
}

/**
 * Cria tarefa vinculada ao pedido de forma idempotente
 * (uma única tarefa por par pedido_id + tipo).
 */
export async function criarTarefaPedido(
  sb: SB,
  args: {
    pedidoId: string;
    leadId: string | null;
    ownerId: string | null;
    tipo: string;
    titulo: string;
    descricao: string;
    dueDate: Date;
    prioridade?: number;
    /** Idempotência por (pedido_id, tipo, owner_id) em vez de (pedido_id, tipo). */
    porOwner?: boolean;
  },
): Promise<{ criada: boolean; id?: string }> {
  if (!args.ownerId) return { criada: false };
  let q = sb
    .from("tarefas")
    .select("id")
    .eq("pedido_id", args.pedidoId)
    .eq("tipo", args.tipo);
  if (args.porOwner) q = q.eq("owner_id", args.ownerId);
  const { data: existente } = await q.limit(1).maybeSingle();
  if (existente?.id) return { criada: false, id: existente.id as string };

  const { data, error } = await sb
    .from("tarefas")
    .insert({
      pedido_id: args.pedidoId,
      lead_id: args.leadId,
      owner_id: args.ownerId,
      title: args.titulo.slice(0, 200),
      descricao: `[pedido:${args.pedidoId}] ${args.descricao}`,
      tipo: args.tipo,
      kind: args.tipo,
      prioridade: args.prioridade ?? 2,
      due_date: args.dueDate.toISOString(),
      status: "pendente",
      origem: "pedido_fluxo",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[pedidos-fluxo] falha ao criar tarefa:", error.message);
    return { criada: false };
  }
  return { criada: true, id: data?.id as string | undefined };
}

/* ------------------------------------------------------------------ */
/* Motor de regras de aprovação financeira                             */
/* ------------------------------------------------------------------ */

export async function carregarParamsAprovacao(sb: SB): Promise<AprovacaoParams> {
  const { data } = await sb
    .from("arena_config")
    .select("aprovacao_valor_obrigatorio, aprovacao_primeira_compra_valor, aprovacao_recorrencia_dias")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return { ...APROVACAO_PARAMS_PADRAO };
  return {
    valorObrigatorio: Number(data.aprovacao_valor_obrigatorio ?? APROVACAO_PARAMS_PADRAO.valorObrigatorio),
    primeiraCompraValor: Number(
      data.aprovacao_primeira_compra_valor ?? APROVACAO_PARAMS_PADRAO.primeiraCompraValor,
    ),
    recorrenciaDias: Number(data.aprovacao_recorrencia_dias ?? APROVACAO_PARAMS_PADRAO.recorrenciaDias),
  };
}

/** Etapas que comprovam faturamento/entrega efetivos (novas + legadas). */
const STAGES_FATURADO_ENTREGUE = [
  "faturado_em_rota",
  "pos_venda",
  "faturado_aguardando_coleta",
  "despachado_transporte",
  "pedido_entregue",
  "concluido",
];

/**
 * Avalia a rota de aprovação de um pedido recém-criado.
 * `clienteId` pode ser nulo — nesse caso a recorrência é medida pelo lead.
 */
export async function avaliarAprovacaoPedido(
  sb: SB,
  args: { total: number; leadId: string | null; pedidoIdAtual?: string | null },
): Promise<AprovacaoDecisao & { params: AprovacaoParams }> {
  const params = await carregarParamsAprovacao(sb);

  let primeiraCompra = true;
  let compraNaJanela = false;
  let recorrenteManual = false;

  if (args.leadId) {
    // Histórico de pedidos do mesmo lead
    let q = sb
      .from("pedidos")
      .select("id, stage, created_at, updated_at")
      .eq("lead_id", args.leadId)
      .limit(200);
    if (args.pedidoIdAtual) q = q.neq("id", args.pedidoIdAtual);
    const { data: anteriores } = await q;
    const rows = (anteriores ?? []) as Array<{ stage: string; updated_at: string | null; created_at: string }>;
    primeiraCompra = rows.length === 0;

    const limite = Date.now() - params.recorrenciaDias * 86400_000;
    compraNaJanela = rows.some((r) => {
      if (!STAGES_FATURADO_ENTREGUE.includes(r.stage)) return false;
      const ts = new Date(r.updated_at ?? r.created_at).getTime();
      return Number.isFinite(ts) && ts >= limite;
    });

    // Exceção manual no cadastro do cliente (casado pelo CNPJ/CPF do lead)
    const { data: lead } = await sb
      .from("leads")
      .select("cnpj")
      .eq("id", args.leadId)
      .maybeSingle();
    const doc = (lead?.cnpj ?? "").replace(/\D/g, "");
    if (doc) {
      const { data: cliente } = await sb
        .from("clientes")
        .select("recorrente_manual")
        .eq("cnpj", lead.cnpj)
        .maybeSingle();
      recorrenteManual = !!cliente?.recorrente_manual;
    }
  }

  const decisao = decidirRotaAprovacao(
    { total: args.total, primeiraCompra, compraNaJanela, recorrenteManual },
    params,
  );
  return { ...decisao, params };
}

/* ------------------------------------------------------------------ */
/* Efeitos por entrada de etapa                                        */
/* ------------------------------------------------------------------ */

type PedidoCtx = {
  id: string;
  number: string;
  total: number;
  lead_id: string | null;
  cliente: string;
  vendedor_proprietario_id: string | null;
  modalidade_entrega: string | null;
  entrega_confirmada: string | null;
};

export async function carregarPedidoCtx(sb: SB, pedidoId: string): Promise<PedidoCtx | null> {
  const { data } = await sb
    .from("pedidos")
    .select(
      "id, number, total, lead_id, vendedor_proprietario_id, owner_id, modalidade_entrega, entrega_confirmada, leads:lead_id(company)",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    number: data.number,
    total: Number(data.total ?? 0),
    lead_id: data.lead_id ?? null,
    cliente: data.leads?.company ?? "cliente",
    vendedor_proprietario_id: data.vendedor_proprietario_id ?? data.owner_id ?? null,
    modalidade_entrega: data.modalidade_entrega ?? "coleta",
    entrega_confirmada: data.entrega_confirmada ?? null,
  };
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Cria a tarefa da etapa financeira na agenda de cada destinatário
 * (idempotente por pedido + tipo + owner). Usada tanto pelo fluxo normal
 * quanto pelo backfill de pedidos que já estavam parados na etapa.
 */
export async function criarTarefasEtapaFinanceira(
  sb: SB,
  p: PedidoCtx,
  stage: "analise_financeira" | "aguardando_pagamento",
): Promise<{ ownerId: string; criada: boolean }[]> {
  const alvos = await destinatariosFinanceiro(sb);
  const out: { ownerId: string; criada: boolean }[] = [];
  for (const ownerId of alvos) {
    const args =
      stage === "analise_financeira"
        ? {
            tipo: TAREFA_TIPO_APROVACAO_PENDENTE,
            titulo: `Liberar pedido ${p.number} — ${p.cliente} — ${brl(p.total)}`,
            descricao: `Pedido ${p.number} aguardando liberação financeira.`,
          }
        : {
            tipo: TAREFA_TIPO_AGUARDANDO_PAGAMENTO,
            titulo: `Confirmar pagamento antecipado — Pedido ${p.number} — ${p.cliente}`,
            descricao: `Pedido ${p.number} aguardando confirmação de pagamento antecipado.`,
          };
    const r = await criarTarefaPedido(sb, {
      pedidoId: p.id,
      leadId: p.lead_id,
      ownerId,
      ...args,
      dueDate: new Date(),
      prioridade: 1,
      porOwner: true,
    });
    out.push({ ownerId, criada: r.criada });
  }
  return out;
}

/**
 * Backfill: cria as tarefas de etapa financeira para pedidos que já estão
 * parados em `analise_financeira` / `aguardando_pagamento`. Idempotente.
 */
export async function backfillTarefasEtapaFinanceira(
  sb: SB,
): Promise<{ pedido: string; ownerId: string; criada: boolean }[]> {
  const { data } = await sb
    .from("pedidos")
    .select("id, stage")
    .in("stage", ["analise_financeira", "aguardando_pagamento"]);
  const out: { pedido: string; ownerId: string; criada: boolean }[] = [];
  for (const row of (data ?? []) as Array<{ id: string; stage: string }>) {
    const p = await carregarPedidoCtx(sb, row.id);
    if (!p) continue;
    const res = await criarTarefasEtapaFinanceira(
      sb,
      p,
      row.stage as "analise_financeira" | "aguardando_pagamento",
    );
    for (const r of res) out.push({ pedido: p.number, ...r });
  }
  return out;
}

/**
 * Dispara notificações e automações ao ENTRAR em uma etapa.
 * Nunca lança — falhas são apenas logadas.
 */
export async function aoEntrarNaEtapa(
  sb: SB,
  pedidoId: string,
  stage: string,
  opts?: { motivoReprovacao?: string | null },
): Promise<void> {
  try {
    const p = await carregarPedidoCtx(sb, pedidoId);
    if (!p) return;

    // Ao SAIR das etapas financeiras, conclui as tarefas pendentes correspondentes
    // para não deixar tarefa fantasma na agenda de ninguém.
    await concluirTarefasEtapaFinanceira(sb, pedidoId, stage);

    if (stage === "analise_financeira") {
      await notificarUsuarios(sb, await destinatariosFinanceiro(sb), {
        tipo: "pedido_aprovacao",
        titulo: `Novo pedido para aprovação: ${p.number} — ${p.cliente} — ${brl(p.total)}`,
        pedidoId,
      });
      await criarTarefasEtapaFinanceira(sb, p, stage);
      return;
    }

    if (stage === "aguardando_pagamento") {
      await notificarUsuarios(sb, p.vendedor_proprietario_id ? [p.vendedor_proprietario_id] : [], {
        tipo: "pedido_aguardando_pagamento",
        titulo: `Pedido ${p.number} condicionado a pagamento antecipado — combine com o cliente.`,
        pedidoId,
      });
      await criarTarefasEtapaFinanceira(sb, p, stage);
      return;
    }

    if (stage === "programacao") {
      await notificarUsuarios(sb, await destinatariosOperacional(sb), {
        tipo: "pedido_programacao",
        titulo: `Novo pedido liberado para programação: ${p.number}`,
        pedidoId,
      });
      return;
    }

    if (stage === "reprovado_financeiro") {
      await notificarUsuarios(sb, p.vendedor_proprietario_id ? [p.vendedor_proprietario_id] : [], {
        tipo: "pedido_reprovado",
        titulo: `Pedido ${p.number} reprovado pelo financeiro. Motivo: ${
          opts?.motivoReprovacao ?? "não informado"
        }`,
        pedidoId,
      });
      return;
    }

    if (stage === "em_producao") {
      const operacional = await destinatariosOperacional(sb);
      await criarTarefaPedido(sb, {
        pedidoId,
        leadId: p.lead_id,
        ownerId: operacional[0] ?? null,
        tipo: TAREFA_TIPO_ACOMPANHAR_PRODUCAO,
        titulo: `Acompanhar produção pedido ${p.number} — ${p.cliente}`,
        descricao: `Acompanhamento de produção do pedido ${p.number}. Reagendável.`,
        dueDate: addDiasUteis(new Date(), 2),
        prioridade: 2,
      });
      return;
    }

    if (stage === "pronto") {
      const texto =
        p.modalidade_entrega === "entrega_propria"
          ? `Pedido ${p.number} pronto para entrega`
          : `Pedido ${p.number} pronto — pode solicitar a coleta ao cliente`;
      await notificarUsuarios(sb, p.vendedor_proprietario_id ? [p.vendedor_proprietario_id] : [], {
        tipo: "pedido_pronto",
        titulo: texto,
        pedidoId,
      });
      return;
    }

    if (stage === "pos_venda") {
      // registra Entregue/Coletado conforme a modalidade, se ainda não registrado
      if (!p.entrega_confirmada) {
        await sb
          .from("pedidos")
          .update({
            entrega_confirmada: p.modalidade_entrega === "entrega_propria" ? "entregue" : "coletado",
            entregue_em: new Date().toISOString(),
          })
          .eq("id", pedidoId);
      }
      // fonte única de pós-venda: uma tarefa por pedido
      await criarTarefaPedido(sb, {
        pedidoId,
        leadId: p.lead_id,
        ownerId: p.vendedor_proprietario_id,
        tipo: TAREFA_TIPO_POS_VENDA_PEDIDO,
        titulo: `Pós-venda pedido ${p.number} — ${p.cliente}`,
        descricao:
          "Contato de pós-venda. Concluir esta tarefa ENCERRA o pedido e o remove do quadro.",
        dueDate: addDiasUteis(new Date(), 2),
        prioridade: 2,
      });
    }
  } catch (e) {
    console.error("[pedidos-fluxo] aoEntrarNaEtapa falhou:", e instanceof Error ? e.message : e);
  }
}

/**
 * Conclui tarefas pendentes das etapas financeiras que não correspondem
 * mais à etapa atual do pedido.
 */
export async function concluirTarefasEtapaFinanceira(
  sb: SB,
  pedidoId: string,
  stageAtual: string,
): Promise<void> {
  const tipoDaEtapa: Record<string, string> = {
    analise_financeira: TAREFA_TIPO_APROVACAO_PENDENTE,
    aguardando_pagamento: TAREFA_TIPO_AGUARDANDO_PAGAMENTO,
  };
  const manter = tipoDaEtapa[stageAtual];
  const alvos = TAREFAS_ETAPA_FINANCEIRA.filter((t) => t !== manter);
  if (alvos.length === 0) return;
  const { error } = await sb
    .from("tarefas")
    .update({ status: "concluida", concluida_at: new Date().toISOString() })
    .eq("pedido_id", pedidoId)
    .in("tipo", alvos)
    .in("status", ["pendente", "adiada"]);
  if (error) console.error("[pedidos-fluxo] falha ao concluir tarefas de etapa:", error.message);
}

/** Concluir a tarefa de pós-venda encerra o pedido. */
export async function encerrarPedidoPorTarefa(sb: SB, tarefaId: string): Promise<void> {
  try {
    const { data: t } = await sb
      .from("tarefas")
      .select("pedido_id, tipo")
      .eq("id", tarefaId)
      .maybeSingle();
    if (!t?.pedido_id || t.tipo !== TAREFA_TIPO_POS_VENDA_PEDIDO) return;
    await sb
      .from("pedidos")
      .update({ encerrado_em: new Date().toISOString(), pos_venda_status: "concluido" })
      .eq("id", t.pedido_id)
      .is("encerrado_em", null);
  } catch (e) {
    console.error("[pedidos-fluxo] encerrarPedidoPorTarefa falhou:", e);
  }
}
