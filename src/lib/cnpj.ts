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

/**
 * Converte qualquer erro da consulta de CNPJ em uma mensagem amigável em PT-BR.
 * Nunca vaza JSON cru, stack trace ou detalhes técnicos para o usuário.
 */
export function friendlyCnpjError(e: unknown): string {
  const GENERIC = "Não foi possível consultar o CNPJ agora. Tente novamente em instantes.";
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const msg = (raw ?? "").trim();
  if (!msg) return GENERIC;
  // Rejeita payloads que pareçam JSON cru ou HTML
  if (/^[\[{<]/.test(msg)) return GENERIC;
  // Rejeita mensagens muito longas ou com quebras (provável body de resposta)
  if (msg.length > 180 || /\n/.test(msg)) return GENERIC;
  // Preserva mensagens curtas conhecidas (checksum, não encontrado, 429 amigável, etc.)
  if (/cnpj/i.test(msg) || /consult/i.test(msg) || /encontrad/i.test(msg) || /d[íi]gitos/i.test(msg) || /limite|instantes|tente/i.test(msg)) {
    return msg;
  }
  return GENERIC;
}
