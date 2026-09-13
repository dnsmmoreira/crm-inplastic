/**
 * Gravação MONITORADA de linhas em tabelas sensíveis a RLS.
 *
 * Motivo: inserts em `notificacoes` e `user_audit_log` já foram recusados pelo
 * banco (sem policy de INSERT) e o erro só ia para `console.error` — o aviso
 * simplesmente não chegava e ninguém ficava sabendo. Aqui toda recusa vira uma
 * falha visível em /falhas, com o contexto da ação que falhou.
 *
 * CONTRATO:
 * - nunca lança: devolve `{ ok, error }` e o chamador decide;
 * - erro de permissão vira origem `rls.<tabela>`; qualquer outro erro de
 *   gravação vira `insert.<tabela>` (a tela agrupa por origem + mensagem, então
 *   `ocorrencias` já é o contador de reincidência).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/** Códigos/mensagens que o Postgres usa quando a RLS recusa a linha. */
export function ehErroDePermissao(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const code = String((erro as { code?: unknown }).code ?? "");
  if (code === "42501") return true;
  const msg = String((erro as { message?: unknown }).message ?? "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("permission denied")
  );
}

export function origemDaFalha(tabela: string, erro: unknown): string {
  return `${ehErroDePermissao(erro) ? "rls" : "insert"}.${tabela}`;
}

export type ResultadoInsercao = { ok: boolean; error: unknown };

/**
 * Insere `linhas` em `tabela` e, se o banco recusar, registra a falha com o
 * contexto da ação (quem disparou, qual pedido/proposta, quantas linhas).
 */
export async function inserirMonitorado(
  sb: SB,
  tabela: string,
  linhas: Record<string, unknown> | Array<Record<string, unknown>>,
  contexto: Record<string, unknown> = {},
): Promise<ResultadoInsercao> {
  const lista = Array.isArray(linhas) ? linhas : [linhas];
  if (lista.length === 0) return { ok: true, error: null };

  let error: unknown = null;
  try {
    const res = await sb.from(tabela).insert(lista);
    error = res?.error ?? null;
  } catch (e) {
    error = e;
  }
  if (!error) return { ok: true, error: null };

  const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
  await registrarFalhaAdmin(origemDaFalha(tabela, error), error, {
    tabela,
    linhas: lista.length,
    permissao_negada: ehErroDePermissao(error),
    ...contexto,
  });
  return { ok: false, error };
}
