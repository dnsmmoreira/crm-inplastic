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
  /** UPDATE de UMA linha existente, filtrando por id. */
  atualizar: (id: string, linha: Record<string, unknown>) => PromiseLike<ErroGravacao>;
};

/**
 * Grava o lote e devolve o PRIMEIRO erro encontrado (o motor de sync já sabe
 * classificar e reagendar). Para no primeiro erro: repetir o resto às cegas
 * só empilharia falhas do mesmo motivo.
 */
export async function gravarNovosEExistentes<T>(opts: OpcoesGravacao<T>): Promise<ErroGravacao> {
  const novos = opts.itens.filter((i) => opts.ehNovo(i));
  const existentes = opts.itens.filter((i) => !opts.ehNovo(i));

  if (novos.length) {
    const r = await opts.inserir(novos.map((i) => opts.payloadNovo(i)));
    if (r?.error) return r;
  }

  for (const item of existentes) {
    const { id: _idNoPayload, ...campos } = opts.payloadExistente(item);
    const r = await opts.atualizar(opts.id(item), campos);
    if (r?.error) return r;
  }

  return { error: null };
}
