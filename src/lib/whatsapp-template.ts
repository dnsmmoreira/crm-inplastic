/**
 * Helpers puros para montagem de parâmetros de template da WhatsApp Cloud API.
 * Sem dependência de rede/banco — testável isoladamente.
 */

/** Fallback usado em {{1}} quando não há nome utilizável do contato. */
export const NOME_FALLBACK = "cliente";

/** Templates que nunca podem ser usados em envio de produção. */
export const TEMPLATES_PROIBIDOS_PRODUCAO = new Set(["hello_world"]);

/**
 * Sanitiza um parâmetro de template conforme exigências da Meta:
 * sem quebras de linha, sem tabs, sem espaços duplicados e com corte defensivo.
 */
export function sanitizarParametro(valor: string, maxLen = 200): string {
  return String(valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Extrai o primeiro nome utilizável de um valor livre (nome do contato, razão
 * social, etc.). Descarta valores vazios, numéricos (telefone) ou muito curtos.
 */
export function primeiroNome(bruto?: string | null): string {
  const limpo = sanitizarParametro(bruto ?? "", 80);
  if (!limpo) return NOME_FALLBACK;
  // Só dígitos/símbolos (ex.: telefone) não serve como nome.
  if (!/[a-zA-ZÀ-ÿ]/.test(limpo)) return NOME_FALLBACK;
  const primeiro = limpo.split(/\s+/)[0] ?? "";
  const somenteLetras = primeiro.replace(/[^a-zA-ZÀ-ÿ'-]/g, "");
  if (somenteLetras.length < 2) return NOME_FALLBACK;
  return (
    somenteLetras.charAt(0).toLocaleUpperCase("pt-BR") +
    somenteLetras.slice(1).toLocaleLowerCase("pt-BR")
  );
}

export type ComponenteBody = {
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
};

/**
 * Monta o componente BODY do template. Retorna [] quando não há parâmetro
 * (template sem variáveis) — a Meta rejeita `components` vazio/mal formado.
 */
export function montarComponenteBody(params: Array<string | null | undefined>): ComponenteBody[] {
  const parameters = params
    .map((p) => sanitizarParametro(p ?? ""))
    .filter((p) => p.length > 0)
    .map((text) => ({ type: "text" as const, text }));
  if (parameters.length === 0) return [];
  return [{ type: "body", parameters }];
}
