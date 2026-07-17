// Helpers de formatação compartilhados
export function formatCep(v: string): string {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function formatPhoneBr(v: string): string {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function relativeTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `há ${mo} mês${mo > 1 ? "es" : ""}`;
  const y = Math.floor(mo / 12);
  return `há ${y} ano${y > 1 ? "s" : ""}`;
}

/**
 * Converte um valor de <input type="date"> (YYYY-MM-DD) em ISO ancorado ao
 * meio-dia local, evitando o shift de -1 dia causado por `new Date("YYYY-MM-DD")`
 * (que é interpretado como UTC 00:00 e regride para o dia anterior em TZs negativas).
 * Passa datas ISO completas sem alteração.
 */
export function dateInputToISO(v: string): string {
  if (!v) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return new Date(v).toISOString();
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0).toISOString();
}
