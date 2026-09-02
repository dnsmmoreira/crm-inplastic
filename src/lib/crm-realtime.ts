/**
 * Decisão PURA sobre o que fazer com um evento realtime do Postgres.
 *
 * Antes, qualquer evento em qualquer das 10 tabelas do canal disparava um
 * `loadAll()` (12 SELECTs completos) em toda aba conectada — inclusive na aba
 * que acabou de fazer a escrita. Agora o evento é traduzido em um plano:
 *
 *  - `merge`   → aplicar o próprio `payload.new` no store (1 registro, 0 query);
 *  - `remover` → tirar o registro do store por id (0 query);
 *  - `recarregar` → recarregar APENAS aquela coleção (1 query) quando o payload
 *                   não dá para reconstruir o agregado (itens/parcelas de
 *                   proposta, interações de lead) ou vem incompleto;
 *  - `ignorar` → evento originado por esta própria aba (mesmo conteúdo já
 *                registrado no snapshot do dirty-tracking).
 *
 * `loadAll()` fica reservado ao boot e ao resync de segurança.
 *
 * REPLICA IDENTITY das tabelas é `default` (só a PK no `old`): por isso o
 * DELETE só usa `old.id`, e nunca as demais colunas de `old`.
 */

export type ColecaoRealtime =
  | "leads"
  | "tasks"
  | "proposals"
  | "products"
  | "emitters"
  | "paymentTerms";

export type TabelaRealtime =
  | "leads"
  | "tarefas"
  | "propostas"
  | "proposta_itens"
  | "proposta_parcelas"
  | "lead_interactions"
  | "lead_ai_actions"
  | "produtos"
  | "emitters"
  | "condicoes_pagamento";

export type EventoRealtime = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

export type PlanoRealtime =
  | { acao: "ignorar"; motivo: string }
  | { acao: "merge"; colecao: ColecaoRealtime; row: Record<string, unknown> }
  | { acao: "remover"; colecao: ColecaoRealtime; id: string }
  | { acao: "recarregar"; colecao: ColecaoRealtime };

/** Tabela → coleção do store afetada (tabelas-filhas apontam para o pai). */
const COLECAO_POR_TABELA: Record<TabelaRealtime, ColecaoRealtime> = {
  leads: "leads",
  tarefas: "tasks",
  propostas: "proposals",
  proposta_itens: "proposals",
  proposta_parcelas: "proposals",
  lead_interactions: "leads",
  lead_ai_actions: "leads",
  produtos: "products",
  emitters: "emitters",
  condicoes_pagamento: "paymentTerms",
};

/**
 * Tabelas-filhas: o store guarda o agregado (proposta com itens/parcelas,
 * lead com interações), então NÃO dá para montar o registro a partir do
 * payload — recarrega-se a coleção pai inteira, mas com uma única query.
 */
const TABELAS_FILHAS: readonly string[] = [
  "proposta_itens",
  "proposta_parcelas",
  "lead_interactions",
  "lead_ai_actions",
];

/** Colunas mínimas para o `rowTo*` da tabela não produzir lixo. */
const COLUNAS_OBRIGATORIAS: Record<string, readonly string[]> = {
  leads: ["id", "company", "stage", "created_at"],
  tarefas: ["id", "title", "due_date"],
  propostas: ["id", "number", "lead_id", "owner_id", "status", "created_at", "emitter_id"],
  produtos: ["id", "sku", "name"],
  emitters: ["id", "brand", "legal_name", "cnpj"],
  condicoes_pagamento: ["id", "label", "method"],
};

export type ContextoRealtime = {
  /**
   * `true` quando o conteúdo do payload é idêntico ao que esta aba acabou de
   * gravar (snapshot do dirty-tracking) — ou seja, eco da própria escrita.
   */
  ehEscritaPropria: (colecao: ColecaoRealtime, row: Record<string, unknown>) => boolean;
};

export function planejarEventoRealtime(
  ev: EventoRealtime,
  ctx: ContextoRealtime,
): PlanoRealtime {
  const colecao = COLECAO_POR_TABELA[ev.table as TabelaRealtime];
  if (!colecao) return { acao: "ignorar", motivo: "tabela fora do escopo do store" };

  if (TABELAS_FILHAS.includes(ev.table)) {
    // Agregado pai não é reconstruível pelo payload do filho.
    return { acao: "recarregar", colecao };
  }

  if (ev.eventType === "DELETE") {
    const id = ev.old?.["id"];
    if (typeof id !== "string" || !id) return { acao: "recarregar", colecao };
    return { acao: "remover", colecao, id };
  }

  const row = ev.new;
  if (!row || typeof row["id"] !== "string" || !row["id"]) {
    return { acao: "recarregar", colecao };
  }
  const obrigatorias = COLUNAS_OBRIGATORIAS[ev.table] ?? ["id"];
  const incompleto = obrigatorias.some((c) => !(c in row));
  if (incompleto) return { acao: "recarregar", colecao };

  if (ctx.ehEscritaPropria(colecao, row)) {
    return { acao: "ignorar", motivo: "eco da escrita desta aba" };
  }

  return { acao: "merge", colecao, row };
}

/** Substitui (ou adiciona) um registro por id, preservando a ordem existente. */
export function mesclarPorId<T extends { id: string }>(lista: T[], item: T): T[] {
  const idx = lista.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...lista];
  const out = lista.slice();
  out[idx] = item;
  return out;
}

export function removerPorId<T extends { id: string }>(lista: T[], id: string): T[] {
  const idx = lista.findIndex((x) => x.id === id);
  if (idx === -1) return lista;
  const out = lista.slice();
  out.splice(idx, 1);
  return out;
}
