/**
 * Leitura OPERACIONAL da configuração do Xerife.
 *
 * As telas que não são de administrador não podem enxergar os pesos do placar
 * (`placar_peso_*`, `placar_dias_sem_proposta_limite`). A função SECURITY
 * DEFINER `xerife_config_operacional()` devolve só as colunas operacionais e
 * é executável apenas por quem está autenticado (e pelo service role).
 *
 * Quem lê a TABELA direto: só as telas de admin (configuração do Xerife) e o
 * motor/crons, que rodam com service role.
 */

// Cliente frouxo de propósito: o mesmo helper serve para o client autenticado
// do usuário e para o supabaseAdmin dos crons.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = any;

export type ConfigOperacional = Record<string, unknown>;

export async function lerConfigOperacional(
  sb: ClienteSupabase,
): Promise<{ data: ConfigOperacional | null; error: unknown }> {
  const { data, error } = await sb.rpc("xerife_config_operacional");
  const linha = Array.isArray(data) ? ((data[0] ?? null) as ConfigOperacional | null) : null;
  return { data: linha, error: error ?? null };
}
