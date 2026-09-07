/**
 * Validações puras da correção INLINE em /pendencias.
 * Sem rede e sem banco — o servidor usa as mesmas funções antes de gravar.
 */

import { isValidCnpj, isValidCpf } from "@/lib/cnpj";

/** Peso em kg: número finito, maior que zero, no máximo 3 casas. */
export function pesoValido(v: unknown): boolean {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 && n < 100_000;
}

/** Normaliza o peso digitado (aceita vírgula) para 3 casas decimais. */
export function normalizarPeso(v: string | number): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!pesoValido(n)) return null;
  return Math.round(n * 1000) / 1000;
}

/** E-mail simples o bastante para NF: algo@algo.dominio, sem espaços. */
export function emailValido(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s || /\s/.test(s) || s.length > 200) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(s);
}

export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

export type TipoDocumento = "cnpj" | "cpf";

/** Documento aceito: CNPJ (14) ou CPF (11) com dígitos verificadores válidos. */
export function documentoValido(v: string | null | undefined): TipoDocumento | null {
  const d = soDigitos(v);
  if (d.length === 14) return isValidCnpj(d) ? "cnpj" : null;
  if (d.length === 11) return isValidCpf(d) ? "cpf" : null;
  return null;
}

/** Máscara progressiva de CPF/CNPJ enquanto se digita. */
export function mascararDocumento(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}
