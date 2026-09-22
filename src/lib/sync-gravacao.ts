/**
 * Gravação em lote do motor de sync: NOVO usa INSERT, EXISTENTE usa UPDATE.
 *
 * Motivo (incidente 22/09, lead "ELO SOLUCAO" do Daniel): o motor gravava tudo
 * com `upsert(..., { onConflict: "id" })`. Num `INSERT ... ON CONFLICT DO
 * UPDATE` o Postgres aplica o WITH CHECK da policy de INSERT à LINHA PROPOSTA —
 * e o payload de registro já existente, de propósito, não leva `owner_id`
 * (proteção contra aba desatualizada desfazer troca de dono no servidor). Com
 * `owner_id` nulo a policy `leads owner insert` (owner_id = auth.uid()) recusa
 * com 42501, e TODO vendedor não-admin ficava impedido de salvar o próprio lead.
 *
 * Regra desta camada:
 * - registro novo  → INSERT (leva o dono);
 * - registro já existente → UPDATE por id (segue sem dono/etapa/reagendamento,
 *   que só mudam por ação explícita).
 *
 * Módulo PURO: recebe as funções de gravação, não conhece Supabase. Assim dá
 * para testar a regra sem banco.
 */

export type ErroGravacao = { error: unknown };
/** Resultado de UPDATE com `.select("id")`: `data` traz as linhas alteradas. */
export type ResultadoUpdate = { error: unknown; data?: unknown[] | null };

export type OpcoesGravacao<T> = {
  itens: T[];
  /** Id do registro (usado no `.eq("id", …)` do update). */
  id: (item: T) => string;
  /** `true` quando o registro ainda não existe no servidor (snapshot). */
  ehNovo: (item: T) => boolean;
  /** Payload completo de criação (com dono). */
  payloadNovo: (item: T) => Record<string, unknown>;
  /** Payload de atualização (sem os campos que só mudam por ação explícita). */
  payloadExistente: (item: T) => Record<string, unknown>;
  /** INSERT em lote das linhas novas. */
  inserir: (linhas: Array<Record<string, unknown>>) => PromiseLike<ErroGravacao>;
  /**
   * UPDATE de UMA linha existente, filtrando por id. DEVE usar `.select("id")`:
   * é o retorno das linhas que revela a recusa silenciosa da RLS.
   */
  atualizar: (id: string, linha: Record<string, unknown>) => PromiseLike<ResultadoUpdate>;
};

/**
 * UPDATE barrado pela RLS NÃO dá erro: o Postgres apenas não enxerga a linha e
 * o PostgREST devolve `error: null` com zero linhas. Sem isto o motor marcaria
 * a alteração como salva e ela sumiria sem aviso. Viramos num erro sintético
 * com o mesmo código da recusa de permissão, para seguir o caminho já pronto:
 * diagnóstico do dono real, mensagem certa, registro em /falhas e recarga.
 */
export function erroRecusaSilenciosa(tabela: string, ids: string[]): {
  code: string;
  message: string;
  ids: string[];
} {
  return {
    code: "42501",
    message: `A gravação em ${tabela} foi recusada pelo servidor (nenhuma linha alterada) — sem permissão ou o registro não existe mais.`,
    ids,
  };
}

/**
 * Grava o lote e devolve o PRIMEIRO erro encontrado (o motor de sync já sabe
 * classificar e reagendar). Para no primeiro erro: repetir o resto às cegas
 * só empilharia falhas do mesmo motivo.
 */
export async function gravarNovosEExistentes<T>(
  opts: OpcoesGravacao<T> & { tabela?: string },
): Promise<ErroGravacao> {
  const novos = opts.itens.filter((i) => opts.ehNovo(i));
  const existentes = opts.itens.filter((i) => !opts.ehNovo(i));

  if (novos.length) {
    const r = await opts.inserir(novos.map((i) => opts.payloadNovo(i)));
    if (r?.error) return r;
  }

  for (const item of existentes) {
    const { id: _idNoPayload, ...campos } = opts.payloadExistente(item);
    const id = opts.id(item);
    const r = await opts.atualizar(id, campos);
    if (r?.error) return { error: r.error };
    if (!r?.data || r.data.length === 0) {
      return { error: erroRecusaSilenciosa(opts.tabela ?? "registro", [id]) };
    }
  }

  return { error: null };
}
