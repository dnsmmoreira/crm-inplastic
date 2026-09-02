/**
 * Guardas contra "erros engolidos em silêncio".
 *
 * Toda chamada Supabase (`insert/update/upsert/delete/rpc`) precisa checar
 * `error`. Estes helpers padronizam as duas coisas que sempre têm que
 * acontecer quando ela falha:
 *   1) registrar em `falhas_sistema` via `registrarFalhaAdmin` (service role);
 *   2) propagar um `Error` com mensagem em português, que chega ao toast.
 *
 * Nunca são usados no caminho feliz — só quando `error` vem preenchido.
 */

export const MSG_PERMISSAO_INDISPONIVEL =
  "Não foi possível verificar suas permissões agora. Tente novamente.";

type ResultadoSupabase<T> = { data: T; error: unknown };

/** Registra a falha sem nunca lançar (import dinâmico: server-only). */
export async function registrarFalhaSegura(
  origem: string,
  erro: unknown,
  contexto?: Record<string, unknown>,
): Promise<void> {
  try {
    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin(origem, erro, contexto);
  } catch (e) {
    console.error(`[guard-erros] falha ao registrar (origem=${origem}):`, e);
  }
}

function mensagemDo(erro: unknown, fallback: string): string {
  const m = (erro as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m : fallback;
}

/**
 * Lança (e registra) quando a operação Supabase falhou.
 * `mensagem` sobrescreve a mensagem exibida ao usuário.
 */
export async function assertNoError(
  res: { error: unknown } | null | undefined,
  origem: string,
  contexto?: Record<string, unknown>,
  mensagem?: string,
): Promise<void> {
  const erro = res?.error;
  if (!erro) return;
  await registrarFalhaSegura(origem, erro, contexto);
  throw new Error(mensagem ?? mensagemDo(erro, "Não foi possível concluir a operação."));
}

/**
 * Gate de permissão FAIL-CLOSED: se a RPC de permissão falhar, a operação é
 * bloqueada (nunca liberada) e a falha vira incidente registrado.
 * Retorna `data` quando a RPC respondeu.
 */
export async function assertRpcPermissao<T>(
  res: ResultadoSupabase<T>,
  origem: string,
  contexto?: Record<string, unknown>,
  mensagem?: string,
): Promise<T> {
  if (res?.error) {
    await registrarFalhaSegura(origem, res.error, contexto);
    throw new Error(mensagem ?? MSG_PERMISSAO_INDISPONIVEL);
  }
  return res?.data as T;
}
