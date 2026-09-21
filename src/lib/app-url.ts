/**
 * Fonte ÚNICA do endereço público do CRM.
 *
 * Regra de segurança (mantida do fluxo de convites): a base NUNCA vem de
 * `Host`/`Origin`/`Referer` do cliente — vem de `APP_PUBLIC_URL` e só é aceita
 * se estiver na allowlist abaixo. Valor estranho → cai no endereço atual.
 *
 * Troca de domínio: basta mudar `APP_PUBLIC_URL`. Todo link enviado a cliente
 * (proposta, convite) e todo link interno (Telegram, avisos de conversa)
 * passa por aqui.
 *
 * Este módulo é puro e sem import de servidor, para poder ser usado também
 * pelos templates de e-mail.
 */

export const URLS_PERMITIDAS = [
  "https://crm.inplastic.com.br",
  "https://crm.aginext.com.br",
  "https://crm-inplastic.lovable.app",
  "http://localhost:8080",
] as const;

/** Endereço usado quando `APP_PUBLIC_URL` está ausente ou fora da allowlist. */
export const URL_PADRAO = URLS_PERMITIDAS[0];

function envUrl(): string {
  // `process` não existe no browser; leitura protegida de propósito.
  const bruto =
    typeof process !== "undefined" && process.env ? (process.env.APP_PUBLIC_URL ?? "") : "";
  return bruto.replace(/\/+$/, "");
}

/** Base pública do CRM, ex.: `https://crm.inplastic.com.br` (sem barra final). */
export function appBaseUrl(): string {
  const env = envUrl();
  return (URLS_PERMITIDAS as readonly string[]).includes(env) ? env : URL_PADRAO;
}

/** Endereço completo para um caminho, ex.: `appUrl("/conversas?c=1")`. */
export function appUrl(caminho = ""): string {
  const base = appBaseUrl();
  if (!caminho) return base;
  return `${base}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

/** Só o host, para textos curtos (Telegram): `crm.inplastic.com.br/equipe`. */
export function appHost(caminho = ""): string {
  return appUrl(caminho).replace(/^https?:\/\//, "");
}
