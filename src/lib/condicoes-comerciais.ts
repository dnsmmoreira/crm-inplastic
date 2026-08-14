/**
 * Helpers de vencimentos das parcelas da proposta.
 * O catálogo de condições é o de "condições de pagamento" (PaymentTerm) já
 * existente; aqui ficam apenas os cálculos de data e divisão de valores.
 */

/** Soma dias a uma data yyyy-MM-dd sem sofrer shift de fuso. */
export function addDaysToDateInput(dateInput: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!m) return dateInput;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateBr(dateInput?: string | null): string {
  if (!dateInput) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateInput);
  if (!m) return dateInput;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Divide o total igualmente entre N parcelas, jogando o ajuste de centavos na última. */
export function dividirValor(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round((total || 0) * 100);
  const base = Math.floor(cents / n);
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = cents - base * (n - 1);
  return out.map((c) => +(c / 100).toFixed(2));
}
