/**
 * Classificação do erro de gravação do motor de sync (`crm-sync.ts`).
 *
 * Motivo (incidente 10/09): quando o upsert de `tarefas` batia na RLS
 * (`owner_id = auth.uid()`) porque o dono do lead/tarefa havia mudado no
 * servidor enquanto a aba estava aberta, o registro continuava "sujo" para
 * sempre e o mesmo erro voltava a cada ciclo de save — toast infinito para o
 * vendedor até recarregar a página na mão.
 *
 * Regra: erro PERMANENTE (RLS, FK, check, not-null, unique, enum inválido) só
 * some com dado novo do servidor — não adianta repetir. Erro TRANSITÓRIO
 * (rede, timeout, 5xx, token expirado) continua com retry.
 */

/** Códigos Postgres/PostgREST que nunca se resolvem repetindo o mesmo payload. */
const CODIGOS_PERMANENTES = new Set([
  "42501", // insufficient_privilege / RLS
  "23502", // not null violation
  "23503", // foreign key violation
  "23505", // unique violation
  "23514", // check constraint violation
  "22P02", // invalid text representation (enum/uuid inválido)
  "42703", // coluna inexistente (bundle desatualizado)
  "P0001", // raise exception de trigger (ex.: tg_tarefas_protect)
  "PGRST204", // coluna não encontrada no schema cache
]);

const TRECHOS_PERMANENTES = [
  "row-level security",
  "violates row-level",
  "violates foreign key",
  "violates check constraint",
  "permission denied",
  "not-null constraint",
  "duplicate key value",
];

const TRECHOS_TRANSITORIOS = [
  "failed to fetch",
  "networkerror",
  "network error",
  "timeout",
  "timed out",
  "load failed",
  "aborted",
];

function textoDoErro(erro: unknown): string {
  if (!erro) return "";
  if (typeof erro === "string") return erro.toLowerCase();
  if (typeof erro === "object") {
    const e = erro as { message?: unknown; details?: unknown; hint?: unknown };
    return [e.message, e.details, e.hint]
      .filter((v) => typeof v === "string")
      .join(" ")
      .toLowerCase();
  }
  return String(erro).toLowerCase();
}

function codigoDoErro(erro: unknown): string {
  if (erro && typeof erro === "object") {
    const c = (erro as { code?: unknown }).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return "";
}

/**
 * `true` quando repetir a mesma escrita nunca vai funcionar — o cache local
 * está velho e precisa ser substituído pelo servidor.
 */
export function ehErroPermanente(erro: unknown): boolean {
  const texto = textoDoErro(erro);
  if (TRECHOS_TRANSITORIOS.some((t) => texto.includes(t))) return false;
  if (CODIGOS_PERMANENTES.has(codigoDoErro(erro))) return true;
  return TRECHOS_PERMANENTES.some((t) => texto.includes(t));
}
