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
import {
  DESFECHO_AUTOMATICO,
  motivoEncerramento,
  tiposParaEncerrarNaTransicao,
  todosTiposPedido,
} from "@/lib/tarefas-encerramento";

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

/** Usuários ativos cujo perfil ativo concede a permissão informada. */

export async function usuariosComPermissao(sb: SB, chave: string): Promise<string[]> {
  const { data: vinculos } = await sb
    .from("perfil_permissoes")
    .select("perfil_id")
    .eq("permissao_chave", chave);
  const perfilIds = Array.from(
    new Set(((vinculos ?? []) as Array<{ perfil_id: string }>).map((r) => r.perfil_id)),
  );
  if (perfilIds.length === 0) return [];
  const { data: perfis } = await sb
    .from("perfis")
    .select("id")
    .in("id", perfilIds)
    .eq("ativo", true);
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
 * Quem responde pela APROVAÇÃO FINANCEIRA = chave `pedidos.aprovar_financeiro`.
 * Não usa `pedidos.movimentar`: essa chave é de quem OPERA o pedido (produção,
 * coleta, entrega) e inclui gente que não responde pela liberação financeira.
 * Notificação != capacidade: quem pode aprovar/reprovar continua definido em
 * `isAdminOuFinanceiro` (pedidos.functions.ts).
 */
export async function destinatariosFinanceiro(sb: SB): Promise<string[]> {
  return usuariosComPermissao(sb, "pedidos.aprovar_financeiro");
}

/**
 * Quem deve ser AVISADO quando um pedido é liberado, e quem vira dono da
 * tarefa de acompanhar produção = chave `pedidos.operar_producao`.
 *
 * Não usa `pedidos.movimentar`: essa chave é sobre QUEM PODE mover o pedido de
 * etapa (RLS das tabelas de pedido + guard de `updatePedidoStage`) e é ampla
 * de propósito — inclui Administrador, Financeiro, Gestor Comercial. Usá-la
 * para notificar enchia a caixa de todo mundo com alertas de produção.
 * `pedidos.operar_producao` é o grupo estreito que de fato toca
 * produção/coleta/entrega (perfil Operacional).
 */
export async function destinatariosOperacional(sb: SB): Promise<string[]> {
  return usuariosComPermissao(sb, "pedidos.operar_producao");
}

/* ------------------------------------------------------------------ */
/* Notificações na tela                                                */
/* ------------------------------------------------------------------ */

/**
 * Cliente usado para GRAVAR os efeitos de entrada de etapa.
 *
 * Os efeitos criam linhas para OUTRAS pessoas (financeiro, operacional,
 * vendedor). Com o client do usuário isso é barrado por RLS —
 * `notificacoes` não tem policy de INSERT — e o erro era apenas logado.
 * Portanto os efeitos usam o client de serviço; se ele não estiver
 * disponível, cai de volta no client recebido.
 */
async function clienteDeEfeitos(sb: SB): Promise<SB> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as SB;
  } catch (e) {
    console.error(
      "[pedidos-fluxo] client de serviço indisponível, usando client do usuário:",
      e instanceof Error ? e.message : e,
    );
    return sb;
  }
}

/**
 * Etapa anterior do pedido, lida do histórico (último movimento que chegou em
 * `stageAtual`). Usada quando o chamador não informa `de`.
 */
async function stageAnterior(sb: SB, pedidoId: string, stageAtual: string): Promise<string | null> {
  const { data } = await sb
    .from("pedido_stage_history")
    .select("from_stage, to_stage, created_at")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = (data ?? []) as Array<{ from_stage: string | null; to_stage: string }>;
  const hit = rows.find((r) => r.to_stage === stageAtual && r.from_stage !== stageAtual);
  return hit?.from_stage ?? null;
}


/** Notifica de forma idempotente por (pedido_id, tipo, user_id). */
/**
 * Gestores responsáveis pelos usuários informados (`profiles.gestor_id`).
 * Usado só para CÓPIA INFORMATIVA — nunca concede permissão nem vira dono.
 */
export async function gestoresDe(sb: SB, userIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data } = await sb.from("profiles").select("id, gestor_id").in("id", ids);
  const perfis = ((data ?? []) as Array<{ id: string; gestor_id: string | null }>).map((p) => ({
    id: p.id,
    gestorId: p.gestor_id,
  }));
  const { gestorDe } = await import("@/lib/gestor");
  const out = new Set<string>();
  for (const id of ids) {
    const g = gestorDe(id, perfis);
    if (g && !ids.includes(g)) out.add(g);
  }
  return Array.from(out);
}

export async function notificarUsuarios(
  sbEntrada: SB,
  userIds: string[],
  args: {
    tipo: string;
    titulo: string;
    pedidoId: string;
    exigeAceite?: boolean;
    /** Proposta reaberta pela devolução — o pop-up leva direto para ela. */
    propostaId?: string | null;
    /**
     * Avisos que podem acontecer VÁRIAS vezes no mesmo pedido (ex.: prazo real
     * alterado duas vezes). Sem isto, o dedupe por (pedido, tipo) silenciaria o
     * segundo aviso para sempre. Com isto, só o aviso ainda NÃO aceito bloqueia
     * um novo — a tela nunca duplica, mas nada se perde.
     */
    repetivel?: boolean;
    /** `false` quando o chamador já entregou um client que pode gravar. */
    usarClienteDeServico?: boolean;
  },
): Promise<number> {
  const alvos = Array.from(new Set(userIds.filter(Boolean)));
  if (alvos.length === 0) return 0;

  // A notificação é sempre para OUTRA pessoa: `notificacoes` não tem policy de
  // INSERT, então o client do usuário é barrado pelo RLS. Grava pelo serviço.
  const sb: SB =
    args.usarClienteDeServico === false ? sbEntrada : await clienteDeEfeitos(sbEntrada);

  // Cópia informativa para o gestor responsável (ex.: representantes → gestora).
  const copias = await gestoresDe(sb, alvos);
  const todos = [...alvos, ...copias];

  let q = sb
    .from("notificacoes")
    .select("user_id")
    .eq("pedido_id", args.pedidoId)
    .eq("tipo", args.tipo)
    .in("user_id", todos);
  if (args.repetivel) q = q.is("aceito_em", null);
  const { data: jaExistem } = await q;
  const existentes = new Set(
    ((jaExistem ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );
  const novos = todos.filter((u) => !existentes.has(u));

  if (novos.length === 0) return 0;

  const exigeAceite = args.exigeAceite ?? args.tipo.startsWith("pedido_");
  const { error } = await sb.from("notificacoes").insert(
    novos.map((user_id) => ({
      user_id,
      tipo: args.tipo,
      titulo: args.titulo.slice(0, 300),
      pedido_id: args.pedidoId,
      proposta_id: args.propostaId ?? null,
      // Alertas de pedido exigem aceite explícito do destinatário (default true).
      // A cópia do gestor é sempre informativa: nunca exige aceite.
      exige_aceite: copias.includes(user_id) ? false : exigeAceite,
    })),
  );
  if (error) {
    console.error("[pedidos-fluxo] falha ao notificar:", error.message);
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("pedido.notificacao", error.message, {
      pedido_id: args.pedidoId,
      tipo: args.tipo,
      destinatarios: novos,
    });
    return 0;
  }
  return novos.length;
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
  let q = sb.from("tarefas").select("id").eq("pedido_id", args.pedidoId).eq("tipo", args.tipo);
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
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("pedido.tarefa", error.message, {
      pedido_id: args.pedidoId,
      lead_id: args.leadId,
      owner_id: args.ownerId,
      tipo: args.tipo,
    });
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
    .select(
      "aprovacao_valor_obrigatorio, aprovacao_primeira_compra_valor, aprovacao_recorrencia_dias",
    )
    .eq("id", 1)
    .maybeSingle();
  if (!data) return { ...APROVACAO_PARAMS_PADRAO };
  return {
    valorObrigatorio: Number(
      data.aprovacao_valor_obrigatorio ?? APROVACAO_PARAMS_PADRAO.valorObrigatorio,
    ),
    primeiraCompraValor: Number(
      data.aprovacao_primeira_compra_valor ?? APROVACAO_PARAMS_PADRAO.primeiraCompraValor,
    ),
    recorrenciaDias: Number(
      data.aprovacao_recorrencia_dias ?? APROVACAO_PARAMS_PADRAO.recorrenciaDias,
    ),
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
    const rows = (anteriores ?? []) as Array<{
      stage: string;
      updated_at: string | null;
      created_at: string;
    }>;
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
  sbIn: SB,
  pedidoId: string,
  stage: string,
  opts?: {
    motivoReprovacao?: string | null;
    usarClienteDeServico?: boolean;
    /** Etapa anterior. Quando ausente, é lida do histórico de etapas. */
    de?: string | null;
  },
): Promise<void> {
  try {
    // Efeitos gravam para terceiros: precisa do client de serviço (RLS barra).
    const usarServico = opts?.usarClienteDeServico !== false;
    const sb: SB = usarServico ? await clienteDeEfeitos(sbIn) : sbIn;

    const p = await carregarPedidoCtx(sb, pedidoId);
    if (!p) return;

    // Condição de morte: tudo que a etapa anterior cobrava (e o que a nova
    // etapa torna sem sentido) é encerrado com desfecho automático.
    const de = opts?.de !== undefined ? opts.de : await stageAnterior(sb, pedidoId, stage);
    const tiposMortos = tiposParaEncerrarNaTransicao(de, stage);
    if (tiposMortos.length > 0) {
      await encerrarTarefasDoPedido(
        sb,
        pedidoId,
        tiposMortos,
        de
          ? motivoEncerramento({ causa: "pedido_saiu", stage: de })
          : motivoEncerramento({ causa: "pedido_entrou", stage }),
      );
    }

    if (stage === "analise_financeira") {
      await notificarUsuarios(sb, await destinatariosFinanceiro(sb), {
        tipo: "pedido_aprovacao",
        titulo: `Novo pedido para aprovação: ${p.number} — ${p.cliente} — ${brl(p.total)}`,
        pedidoId,
        usarClienteDeServico: usarServico,
      });
      await criarTarefasEtapaFinanceira(sb, p, stage);
      return;
    }

    if (stage === "aguardando_pagamento") {
      await notificarUsuarios(sb, p.vendedor_proprietario_id ? [p.vendedor_proprietario_id] : [], {
        tipo: "pedido_aguardando_pagamento",
        titulo: `Pedido ${p.number} condicionado a pagamento antecipado — combine com o cliente.`,
        pedidoId,
        usarClienteDeServico: usarServico,
      });
      await criarTarefasEtapaFinanceira(sb, p, stage);
      return;
    }

    if (stage === "programacao") {
      await notificarUsuarios(sb, await destinatariosOperacional(sb), {
        tipo: "pedido_programacao",
        titulo: `Pedido ${p.number} liberado — assuma o pedido para gerar os romaneios`,
        pedidoId,
        usarClienteDeServico: usarServico,
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
        usarClienteDeServico: usarServico,
      });
      return;
    }

    if (stage === "cancelado") {
      const destinatarios = new Set<string>(
        p.vendedor_proprietario_id ? [p.vendedor_proprietario_id] : [],
      );
      for (const id of await destinatariosOperacional(sb)) destinatarios.add(id);
      await notificarUsuarios(sb, Array.from(destinatarios), {
        tipo: "pedido_cancelado",
        titulo: `Pedido ${p.number} devolvido/cancelado. Motivo: ${
          opts?.motivoReprovacao ?? "não informado"
        }`,
        pedidoId,
        usarClienteDeServico: usarServico,
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
        usarClienteDeServico: usarServico,
      });
      // Próximo ato: alguém precisa combinar a data com o cliente.
      const operacionalPronto = await destinatariosOperacional(sb);
      await criarTarefaPedido(sb, {
        pedidoId,
        leadId: p.lead_id,
        ownerId: p.vendedor_proprietario_id ?? operacionalPronto[0] ?? null,
        tipo: "combinar_coleta",
        titulo: `Combinar coleta/entrega com o cliente — Pedido ${p.number} — ${p.cliente}`,
        descricao:
          "Combine com o cliente a data da coleta/entrega e registre a data no desfecho da tarefa.",
        dueDate: addDiasUteis(new Date(), 1),
        prioridade: 1,
      });
      return;
    }


    if (stage === "pos_venda") {
      // registra Entregue/Coletado conforme a modalidade, se ainda não registrado
      if (!p.entrega_confirmada) {
        // ABORTAR: a confirmação de entrega é pré-requisito do pós-venda;
        // seguir criaria tarefa de pós-venda sobre entrega não registrada.
        const upEntrega = await sb
          .from("pedidos")
          .update({
            entrega_confirmada:
              p.modalidade_entrega === "entrega_propria" ? "entregue" : "coletado",
            entregue_em: new Date().toISOString(),
          })
          .eq("id", pedidoId);
        const { assertNoError } = await import("@/lib/guard-erros");
        await assertNoError(
          upEntrega,
          "pedidos-fluxo.aoEntrarNaEtapa/confirmar-entrega",
          { pedido_id: pedidoId },
          "Não foi possível confirmar a entrega do pedido. Tente novamente.",
        );
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
    console.error(
      `[pedidos-fluxo] aoEntrarNaEtapa falhou (pedido=${pedidoId}, etapa=${stage}):`,
      e instanceof Error ? e.message : e,
    );
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("pedido.etapa", e, { pedido_id: pedidoId, etapa: stage });
  }
}

/**
 * Conclui tarefas pendentes das etapas financeiras que não correspondem
 * mais à etapa atual do pedido.
 */
/**
 * Encerra automaticamente as tarefas de um pedido cujos tipos perderam o
 * sentido. Generaliza a antiga `concluirTarefasEtapaFinanceira`.
 *
 * Toda tarefa fechada aqui é do sistema: desfecho='automatico' + motivo.
 */
export async function encerrarTarefasDoPedido(
  sbIn: SB,
  pedidoId: string,
  tipos: string[],
  motivo: string,
  extra?: { ownerId?: string | null; descricaoContem?: string },
): Promise<number> {
  if (tipos.length === 0) return 0;
  const sb: SB = await clienteDeEfeitos(sbIn);
  const base = {
    status: "concluida",
    concluida_at: new Date().toISOString(),
    desfecho: DESFECHO_AUTOMATICO,
    desfecho_detalhe: motivo,
  } as const;

  // Duas passadas: tarefas sem nota recebem o motivo como nota (o trigger
  // `tg_tarefas_protect` exige nota em pós-venda); as demais preservam a nota.
  let total = 0;
  for (const semNota of [true, false]) {
    let q = sb
      .from("tarefas")
      .update(semNota ? { ...base, nota_conclusao: motivo } : base)
      .eq("pedido_id", pedidoId)
      .in("tipo", tipos)
      .in("status", ["pendente", "adiada"]);
    q = semNota ? q.is("nota_conclusao", null) : q.not("nota_conclusao", "is", null);
    if (extra?.ownerId) q = q.eq("owner_id", extra.ownerId);
    if (extra?.descricaoContem) q = q.filter("descricao", "ilike", `%${extra.descricaoContem}%`);
    const { data, error } = await q.select("id");
    if (error) {
      console.error("[pedidos-fluxo] falha ao encerrar tarefas do pedido:", error.message);
      const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
      await registrarFalhaAdmin("pedido.tarefa", error.message, {
        pedido_id: pedidoId,
        tipos,
        motivo,
        acao: "encerrar_tarefas_do_pedido",
      });
      continue;
    }
    total += (data ?? []).length;
  }
  return total;
}


export const AVISO_POS_VENDA_SEM_COMPROVACAO =
  "Contato registrado. O pedido encerra quando a comprovação de entrega for anexada.";

/**
 * Concluir a tarefa de pós-venda registra o CONTATO e, se a entrega já estiver
 * comprovada (ou dispensada), encerra o pedido. Sem comprovação o pedido fica
 * aberto — é a prova que fecha o ciclo, não o clique.
 */
export async function encerrarPedidoPorTarefa(
  sb: SB,
  tarefaId: string,
): Promise<{ encerrado: boolean; aviso?: string }> {
  try {
    const { data: t } = await sb
      .from("tarefas")
      .select("pedido_id, tipo")
      .eq("id", tarefaId)
      .maybeSingle();
    if (!t?.pedido_id || t.tipo !== TAREFA_TIPO_POS_VENDA_PEDIDO) return { encerrado: false };

    const { data: ped, error: erroPed } = await sb
      .from("pedidos")
      .select(
        "id, encerrado_em, pos_venda_contato_em, entrega_comprovada_em, comprovacao_dispensada_em",
      )
      .eq("id", t.pedido_id)
      .maybeSingle();
    if (erroPed) throw new Error(erroPed.message);
    if (!ped) return { encerrado: false };

    const agora = new Date().toISOString();
    if (!ped.pos_venda_contato_em) {
      const upContato = await sb
        .from("pedidos")
        .update({ pos_venda_contato_em: agora })
        .eq("id", t.pedido_id);
      if (upContato?.error) {
        throw new Error(`Não foi possível registrar o contato de pós-venda: ${upContato.error.message}`);
      }
    }
    if (ped.encerrado_em) return { encerrado: true };

    const { comprovacaoOk } = await import("@/lib/pedido-avanco");
    if (!comprovacaoOk(ped)) {
      return { encerrado: false, aviso: AVISO_POS_VENDA_SEM_COMPROVACAO };
    }

    // ABORTAR: o fechamento do pós-venda é o efeito principal — se falhar,
    // o pedido ficaria eternamente aberto sem ninguém saber.
    const upEncerrar = await sb
      .from("pedidos")
      .update({
        encerrado_em: agora,
        pos_venda_status: "concluido",
        encerrado_motivo: "contato de pós-venda e comprovação de entrega registrados",
      })
      .eq("id", t.pedido_id)
      .is("encerrado_em", null);
    if (upEncerrar?.error) {
      throw new Error(
        `Não foi possível encerrar o pedido no pós-venda: ${upEncerrar.error.message}`,
      );
    }
    await encerrarTarefasDoPedido(
      sb,
      t.pedido_id,
      todosTiposPedido(),
      motivoEncerramento({ causa: "pedido_encerrado" }),
    );
    return { encerrado: true };
  } catch (e) {
    console.error("[pedidos-fluxo] encerrarPedidoPorTarefa falhou:", e);
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("pedido.tarefa", e, {
      tarefa_id: tarefaId,
      acao: "encerrar_pedido_por_tarefa",
    });
    return { encerrado: false };
  }
}
