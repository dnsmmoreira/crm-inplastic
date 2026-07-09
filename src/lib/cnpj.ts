// Utilitários client-safe para CNPJ (validação e máscara).

export function onlyDigitsCnpj(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export function formatCnpj(v: string): string {
  const d = onlyDigitsCnpj(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Valida CNPJ (14 dígitos + dígitos verificadores). */
export function isValidCnpj(v: string): boolean {
  const c = onlyDigitsCnpj(v);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const calc = (base: string): number => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(c.slice(0, 12));
  const d2 = calc(c.slice(0, 12) + String(d1));
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}
