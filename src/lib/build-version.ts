/**
 * Identificação de build + detecção de "aba com bundle antigo".
 *
 * Contexto (incidente 03/09/2026): o banco é compartilhado e publicamos várias
 * vezes por dia. Uma aba carregada ANTES de uma migration de schema continua
 * enviando o payload antigo — PostgREST responde 400/42703 ("column ... does
 * not exist") e a gravação daquela tabela nunca acontece, enquanto as demais
 * gravam normalmente (foi o caso de `proposta_itens` × `proposta_parcelas`).
 *
 * Este módulo é PURO: só decide. O efeito (toast, bloqueio de save) fica em
 * `src/lib/bundle-guard.ts`.
 */

/** Build embutido no bundle atual (injetado pelo vite.config no build/dev). */
export const BUILD_ID: string =
  (import.meta.env["VITE_BUILD_ID"] as string | undefined) ?? "dev";

export const MSG_BUNDLE_DESATUALIZADO =
  "Nova versão do CRM disponível — recarregue a página. Até recarregar, o salvamento está bloqueado para não gravar dados com o formato antigo.";

/** `true` quando o build servido pelo servidor difere do build desta aba. */
export function buildMudou(local: string, remoto: unknown): boolean {
  if (typeof remoto !== "string" || !remoto) return false;
  if (!local || local === "dev") return false;
  return remoto !== local;
}

/**
 * Erro de coluna inexistente (PostgREST/Postgres 42703). Tratado como sinal
 * inequívoco de bundle desatualizado, mesmo que a checagem de versão falhe.
 */
export function ehErroColunaInexistente(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const e = erro as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const texto = `${typeof e.message === "string" ? e.message : ""} ${
    typeof e.details === "string" ? e.details : ""
  }`.toLowerCase();
  if (/column .* does not exist/.test(texto)) return true;
  if (/could not find the .* column/.test(texto)) return true;
  return false;
}
