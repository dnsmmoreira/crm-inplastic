/**
 * Painel do gestor — "sem próximo ato" por pessoa.
 *
 * A agregação é pura (`agregarEquipe`) para ser testável; a coleta faz UMA
 * consulta por tabela (sem N+1) e cruza tudo em memória.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasVencida } from "@/lib/tarefa-vencimento";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>;

const DIA_MS = 86400_000;
const LEAD_SEM_CONTATO_DIAS = 5;

export type PessoaEquipe = {
  id: string;
  nome: string;
  gestor_id: string | null;
  telegram: boolean;
};

export type TarefaEquipe = {
  owner_id: string | null;
  tipo: string | null;
  status: string | null;
  due_date: string | null;
  concluida_at: string | null;
  escalonamentos?: number | null;
  id?: string;
  title?: string | null;
  lead_id?: string | null;
};

export type LeadEquipe = {
  id: string;
  company: string | null;
  owner_id: string | null;
  stage: string | null;
  last_interaction_at: string | null;
  created_at: string | null;
};

export type PropostaEquipe = {
  id: string;
  number: string | null;
  owner_id: string | null;
  status: string | null;
  /** Já passou da validade (calculado na coleta). */
  vencida: boolean;
  /** Rascunho parado há 3+ dias. */
  rascunhoParado: boolean;
};

export type PedidoEquipe = {
  id: string;
  number: string | null;
  owner_id: string | null;
  /** Etapa operacional sem responsável. */
  semResponsavel: boolean;
  /** Pós-venda aberto sem contato ou sem comprovação, fora do prazo. */
  posVendaAtrasado: boolean;
};

export type EntradaEquipe = {
  pessoas: PessoaEquipe[];
  tarefas: TarefaEquipe[];
  leads: LeadEquipe[];
  propostas: PropostaEquipe[];
  pedidos: PedidoEquipe[];
  aceites: { user_id: string }[];
  now: Date;
};

export type LinhaEquipe = {
  id: string;
  nome: string;
  gestor_id: string | null;
  telegram: boolean;
  tarefasAbertas: number;
  tarefasPorTipo: Record<string, number>;
  tarefasVencidas: number;
  vencidas5mais: number;
  leadsSemContato: number;
  propostasVencidas: number;
  rascunhosParados: number;
  conversasParadas: number;
  semResposta: number;
  pedidosSemResponsavel: number;
  posVendaAtrasado: number;
  retornosVencidos: number;
  aceitesPendentes: number;
  ultimaConclusao: string | null;
  total: number;
  itens: { grupo: string; label: string; link: string }[];
};

export type ResumoEquipe = {
  linhas: LinhaEquipe[];
  totais: {
    conversasParadas: number;
    tarefasVencidas: number;
    propostasVencidas: number;
    rascunhosParados: number;
    pedidosSemResponsavel: number;
    posVendaAtrasado: number;
    retornosVencidos: number;
    semProximoAto: number;
  };
};

const ABERTA = (s: string | null) => s === "pendente" || s === "adiada";

export function agregarEquipe(e: EntradaEquipe): ResumoEquipe {
  const nowMs = e.now.getTime();
  // "Vencida" conta ROLAGENS do fechamento: o due_date é empurrado todo dia,
  // então a data sozinha nunca fica no passado.
  const vencida = (t: TarefaEquipe) => ABERTA(t.status) && diasVencida(t, e.now) >= 1;

  const linhas: LinhaEquipe[] = e.pessoas.map((p) => ({
    id: p.id,
    nome: p.nome,
    gestor_id: p.gestor_id,
    telegram: p.telegram,
    tarefasAbertas: 0,
    tarefasPorTipo: {},
    tarefasVencidas: 0,
    vencidas5mais: 0,
    leadsSemContato: 0,
    propostasVencidas: 0,
    rascunhosParados: 0,
    conversasParadas: 0,
    semResposta: 0,
    pedidosSemResponsavel: 0,
    posVendaAtrasado: 0,
    retornosVencidos: 0,
    aceitesPendentes: 0,
    ultimaConclusao: null,
    total: 0,
    itens: [],
  }));
  const porId = new Map(linhas.map((l) => [l.id, l]));

  for (const t of e.tarefas) {
    const l = t.owner_id ? porId.get(t.owner_id) : undefined;
    if (!l) continue;
    if (t.status === "concluida") {
      if (t.concluida_at && (!l.ultimaConclusao || t.concluida_at > l.ultimaConclusao)) {
        l.ultimaConclusao = t.concluida_at;
      }
      continue;
    }
    if (!ABERTA(t.status)) continue;
    l.tarefasAbertas++;
    const tipo = t.tipo ?? "outro";
    l.tarefasPorTipo[tipo] = (l.tarefasPorTipo[tipo] ?? 0) + 1;
    if (tipo === "conversa_parada") l.conversasParadas++;
    if (tipo === "resposta_pendente") l.semResposta++;
    if (vencida(t)) {
      l.tarefasVencidas++;
      if (diasVencida(t, e.now) >= 5) l.vencidas5mais++;
      if (tipo === "retorno_agendado") l.retornosVencidos++;
      l.itens.push({
        grupo: "Tarefa vencida",
        label: t.title ?? tipo,
        link: t.lead_id ? `/leads?lead=${t.lead_id}` : "/minha-agenda",
      });
    }
  }

  for (const ld of e.leads) {
    const l = ld.owner_id ? porId.get(ld.owner_id) : undefined;
    if (!l) continue;
    const ref = ld.last_interaction_at ?? ld.created_at;
    if (!ref) continue;
    if (nowMs - new Date(ref).getTime() < LEAD_SEM_CONTATO_DIAS * DIA_MS) continue;
    l.leadsSemContato++;
    l.itens.push({
      grupo: "Lead sem contato",
      label: ld.company ?? "Lead",
      link: `/leads?lead=${ld.id}`,
    });
  }

  for (const pr of e.propostas) {
    const l = pr.owner_id ? porId.get(pr.owner_id) : undefined;
    if (!l) continue;
    if (pr.vencida) {
      l.propostasVencidas++;
      l.itens.push({
        grupo: "Proposta vencida",
        label: pr.number ?? "Proposta",
        link: `/propostas/${pr.id}`,
      });
    }
    if (pr.rascunhoParado) {
      l.rascunhosParados++;
      l.itens.push({
        grupo: "Rascunho parado",
        label: pr.number ?? "Rascunho",
        link: `/propostas/${pr.id}`,
      });
    }
  }

  for (const pd of e.pedidos) {
    const l = pd.owner_id ? porId.get(pd.owner_id) : undefined;
    if (pd.semResponsavel && l) {
      l.pedidosSemResponsavel++;
      l.itens.push({
        grupo: "Pedido sem responsável",
        label: pd.number ?? "Pedido",
        link: `/pedidos?pedido=${pd.id}`,
      });
    }
    if (pd.posVendaAtrasado && l) {
      l.posVendaAtrasado++;
      l.itens.push({
        grupo: "Pós-venda atrasado",
        label: pd.number ?? "Pedido",
        link: `/pedidos?pedido=${pd.id}`,
      });
    }
  }

  for (const a of e.aceites) {
    const l = porId.get(a.user_id);
    if (l) l.aceitesPendentes++;
  }

  for (const l of linhas) {
    l.total =
      l.tarefasVencidas +
      l.leadsSemContato +
      l.propostasVencidas +
      l.rascunhosParados +
      l.conversasParadas +
      l.semResposta +
      l.pedidosSemResponsavel +
      l.posVendaAtrasado +
      l.retornosVencidos;
  }
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  const soma = (f: (l: LinhaEquipe) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const totais = {
    conversasParadas: soma((l) => l.conversasParadas),
    tarefasVencidas: soma((l) => l.tarefasVencidas),
    propostasVencidas: soma((l) => l.propostasVencidas),
    rascunhosParados: soma((l) => l.rascunhosParados),
    pedidosSemResponsavel: soma((l) => l.pedidosSemResponsavel),
    posVendaAtrasado: soma((l) => l.posVendaAtrasado),
    retornosVencidos: soma((l) => l.retornosVencidos),
    semProximoAto: 0,
  };
  totais.semProximoAto = soma((l) => l.total);
  return { linhas, totais };
}

/* ─────────────────────────── coleta (uma consulta por tabela) ─────────────────────────── */

export async function coletarResumoEquipe(
  sb: SB,
  opts?: { userIds?: string[] | null; now?: Date },
): Promise<ResumoEquipe> {
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();

  let qPessoas = sb
    .from("profiles")
    .select("id, name, gestor_id, telegram_chat_id, ativo, deleted_at")
    .eq("ativo", true)
    .is("deleted_at", null);
  if (opts?.userIds) qPessoas = qPessoas.in("id", opts.userIds.length ? opts.userIds : [""]);
  const { data: pessoasRaw, error: errPessoas } = await qPessoas;
  if (errPessoas) throw new Error(`Falha ao carregar pessoas: ${errPessoas.message}`);

  const pessoas: PessoaEquipe[] = (pessoasRaw ?? []).map(
    (p: { id: string; name: string | null; gestor_id: string | null; telegram_chat_id: string | null }) => ({
      id: p.id,
      nome: p.name?.trim() || "sem nome",
      gestor_id: p.gestor_id ?? null,
      telegram: Boolean((p.telegram_chat_id ?? "").trim()),
    }),
  );
  const ids = pessoas.map((p) => p.id);
  if (ids.length === 0)
    return agregarEquipe({ pessoas: [], tarefas: [], leads: [], propostas: [], pedidos: [], aceites: [], now });

  const desde30 = new Date(now.getTime() - 30 * DIA_MS).toISOString();

  const [tarefasRes, leadsRes, propostasRes, pedidosRes, aceitesRes, itensRes] = await Promise.all([
    sb
      .from("tarefas")
      .select("id, owner_id, tipo, status, due_date, concluida_at, title, lead_id, escalonamentos")
      .in("owner_id", ids)
      .or(`status.in.(pendente,adiada),concluida_at.gte.${desde30}`),
    sb
      .from("leads")
      .select("id, company, owner_id, stage, last_interaction_at, created_at")
      .in("owner_id", ids)
      .not("stage", "in", "(ganho,perdido)"),
    sb
      .from("propostas")
      .select(
        "id, number, owner_id, status, sent_at, validity_days, prorrogada_ate, vencida_em, reemitida_como, updated_at, created_at",
      )
      .in("owner_id", ids)
      .in("status", ["rascunho", "enviada", "aguardando_aprovacao"]),
    sb
      .from("pedidos")
      .select(
        // `pedidos` NÃO tem coluna `stage_changed_at` — a entrada na etapa vem
        // de `pedido_stage_history` (pedir a coluna aqui derrubava o fechamento
        // do Xerife com "column pedidos.stage_changed_at does not exist").
        "id, number, stage, vendedor_proprietario_id, responsavel_atual_id, equipe_responsavel, encerrado_em, pos_venda_contato_em, entrega_comprovada_em, comprovacao_dispensada_em, created_at",
      )
      .is("encerrado_em", null),
    sb
      .from("notificacoes")
      .select("user_id")
      .in("user_id", ids)
      .eq("exige_aceite", true)
      .is("aceito_em", null),
    sb.from("proposta_itens").select("proposta_id"),
  ]);

  for (const [nome, r] of [
    ["tarefas", tarefasRes],
    ["leads", leadsRes],
    ["propostas", propostasRes],
    ["pedidos", pedidosRes],
    ["notificacoes", aceitesRes],
    ["proposta_itens", itensRes],
  ] as const) {
    if (r.error) throw new Error(`Falha ao carregar ${nome}: ${r.error.message}`);
  }

  const comItens = new Set(
    ((itensRes.data ?? []) as { proposta_id: string }[]).map((i) => i.proposta_id),
  );

  const tresDiasAtras = now.getTime() - 3 * DIA_MS;
  const propostas: PropostaEquipe[] = (
    (propostasRes.data ?? []) as Array<Record<string, string | number | null>>
  ).map((p) => {
    const status = String(p.status);
    const sent = p.sent_at ? new Date(String(p.sent_at)) : null;
    const validade = p.prorrogada_ate
      ? new Date(String(p.prorrogada_ate))
      : sent
        ? new Date(sent.getTime() + Number(p.validity_days ?? 7) * DIA_MS)
        : null;
    const emAberto = status === "enviada" || status === "aguardando_aprovacao";
    const parado =
      new Date(String(p.updated_at ?? p.created_at ?? nowIso)).getTime() < tresDiasAtras;
    return {
      id: String(p.id),
      number: p.number ? String(p.number) : null,
      owner_id: p.owner_id ? String(p.owner_id) : null,
      status,
      vencida:
        emAberto && !p.reemitida_como && !!validade && validade.getTime() < now.getTime(),
      rascunhoParado: status === "rascunho" && (parado || !comItens.has(String(p.id))),
    };
  });

  const { podeAssumirPedido } = await import("@/lib/pedidos-stages");
  const { comprovacaoOk, contatoOk, diasUteisEntre } = await import("@/lib/pedido-avanco");
  const { data: cfg } = await sb
    .from("xerife_config")
    .select("pos_venda_dias_uteis")
    .eq("id", 1)
    .maybeSingle();
  const prazoPosVenda = Number(cfg?.pos_venda_dias_uteis ?? 5);

  const pedidos: PedidoEquipe[] = (
    (pedidosRes.data ?? []) as Array<Record<string, string | null>>
  ).map((p) => {
    const stage = String(p.stage);
    const operacional = podeAssumirPedido(stage);
    const entrada = p.stage_changed_at ? new Date(String(p.stage_changed_at)) : now;
    const atrasado =
      stage === "pos_venda" &&
      diasUteisEntre(entrada, now) >= prazoPosVenda &&
      (!comprovacaoOk(p) || !contatoOk(p));
    return {
      id: String(p.id),
      number: p.number ? String(p.number) : null,
      owner_id: p.vendedor_proprietario_id ? String(p.vendedor_proprietario_id) : null,
      semResponsavel: operacional && !p.responsavel_atual_id && !p.equipe_responsavel,
      posVendaAtrasado: atrasado,
    };
  });

  // Pedidos operacionais sem dono não pertencem a ninguém: contam para quem
  // pode operar produção.
  const { usuariosComPermissao } = await import("@/lib/pedidos-fluxo.server");
  const operadores = new Set(await usuariosComPermissao(sb, "pedidos.operar_producao"));
  const pedidosAtribuidos: PedidoEquipe[] = [];
  for (const pd of pedidos) {
    if (pd.semResponsavel) {
      for (const uid of ids.filter((i) => operadores.has(i))) {
        pedidosAtribuidos.push({ ...pd, owner_id: uid, posVendaAtrasado: false });
      }
      if (pd.posVendaAtrasado)
        pedidosAtribuidos.push({ ...pd, semResponsavel: false });
    } else if (pd.posVendaAtrasado) {
      pedidosAtribuidos.push({ ...pd, semResponsavel: false });
    }
  }

  return agregarEquipe({
    pessoas,
    tarefas: (tarefasRes.data ?? []) as TarefaEquipe[],
    leads: (leadsRes.data ?? []) as LeadEquipe[],
    propostas,
    pedidos: pedidosAtribuidos,
    aceites: (aceitesRes.data ?? []) as { user_id: string }[],
    now,
  });
}
