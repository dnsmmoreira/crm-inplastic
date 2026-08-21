/**
 * Helpers das condições de pagamento e das parcelas da proposta.
 *
 * Modelo: cada parcela da condição é { dias, percentual }. A soma dos
 * percentuais tem de fechar exatamente 100. O valor de cada parcela sai do
 * percentual (não de divisão igual), com a sobra de arredondamento na última.
 */

export type ParcelaCondicao = { dias: number; percentual: number };

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

/** Percentuais iguais que somam exatamente 100 (sobra na última). */
export function percentuaisIguais(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.round((100 / n) * 100) / 100;
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = +(100 - base * (n - 1)).toFixed(2);
  return out;
}

/** Converte uma lista de dias (splits legado) em parcelas com percentuais iguais. */
export function parcelasDeSplits(splits: number[]): ParcelaCondicao[] {
  const pcts = percentuaisIguais(splits.length);
  return splits.map((dias, i) => ({ dias, percentual: pcts[i] }));
}

export const somaPercentuais = (parcelas: Array<{ percentual: number }>): number =>
  +parcelas.reduce((acc, p) => acc + (Number(p.percentual) || 0), 0).toFixed(2);

/** A soma dos percentuais fecha exatamente 100? */
export const percentuaisValidos = (parcelas: Array<{ percentual: number }>): boolean =>
  parcelas.length > 0 && Math.abs(somaPercentuais(parcelas) - 100) < 0.005;

export function mensagemPercentuais(parcelas: Array<{ percentual: number }>): string | null {
  if (parcelas.length === 0) return "Informe ao menos uma parcela.";
  if (percentuaisValidos(parcelas)) return null;
  const s = somaPercentuais(parcelas);
  return `A soma dos percentuais é ${String(s).replace(".", ",")}% — precisa ser exatamente 100%.`;
}

/**
 * Valores em reais a partir dos percentuais, com a sobra de arredondamento na
 * ÚLTIMA parcela para a soma bater EXATAMENTE com o total.
 */
export function valoresPorPercentual(total: number, percentuais: number[]): number[] {
  const n = percentuais.length;
  if (n === 0) return [];
  const totalCents = Math.round((total || 0) * 100);
  const out = percentuais.map((p) => Math.round((totalCents * (Number(p) || 0)) / 100));
  const soma = out.slice(0, n - 1).reduce((a, b) => a + b, 0);
  out[n - 1] = totalCents - soma;
  return out.map((c) => +(c / 100).toFixed(2));
}

/** Intervalo mais comum entre parcelas consecutivas (0 quando só há uma). */
export function intervaloPredominante(dias: number[]): number {
  if (dias.length < 2) return 0;
  const contagem = new Map<number, number>();
  for (let i = 1; i < dias.length; i++) {
    const d = Math.max(0, dias[i] - dias[i - 1]);
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  let melhor = 0;
  let qtd = -1;
  contagem.forEach((c, d) => {
    if (c > qtd) { qtd = c; melhor = d; }
  });
  return melhor;
}

/** O espaçamento entre as parcelas é irregular? */
export function espacamentoIrregular(dias: number[]): boolean {
  if (dias.length < 3) return false;
  const difs = dias.slice(1).map((d, i) => d - dias[i]);
  return difs.some((d) => d !== difs[0]);
}

/** Reaplica um intervalo uniforme mantendo o prazo da 1ª parcela. */
export function aplicarIntervalo(dias: number[], intervalo: number): number[] {
  if (dias.length === 0) return [];
  const primeiro = dias[0] ?? 0;
  return dias.map((_, i) => primeiro + intervalo * i);
}

const pct = (v: number) => `${String(+Number(v).toFixed(2)).replace(".", ",")}%`;
const prazo = (d: number) => (d === 0 ? "à vista" : `em ${d} dias`);

/**
 * Descrição gerada a partir das parcelas — é ela que impede rótulo mentiroso.
 * Ex.: "50% à vista + 50% em 28 dias" · "4x de 25% (0/15/30/45 dias)".
 */
export function descreverParcelas(parcelas: ParcelaCondicao[]): string {
  if (!parcelas || parcelas.length === 0) return "—";
  if (parcelas.length === 1) {
    const p = parcelas[0];
    return p.dias === 0 ? "100% à vista" : `100% em ${p.dias} dias`;
  }
  const iguais = parcelas.every(
    (p) => Math.abs(p.percentual - parcelas[0].percentual) < 0.02,
  );
  if (iguais) {
    return `${parcelas.length}x de ${pct(parcelas[0].percentual)} (${parcelas
      .map((p) => p.dias)
      .join("/")} dias)`;
  }
  return parcelas.map((p) => `${pct(p.percentual)} ${prazo(p.dias)}`).join(" + ");
}

/** Normaliza o jsonb vindo do banco. */
export function normalizarParcelas(raw: unknown, splitsFallback: number[] = []): ParcelaCondicao[] {
  if (Array.isArray(raw)) {
    const out = raw
      .map((r) => {
        const o = r as { dias?: unknown; percentual?: unknown };
        const dias = Number(o?.dias);
        const percentual = Number(o?.percentual);
        if (!Number.isFinite(dias) || !Number.isFinite(percentual)) return null;
        return { dias: Math.max(0, Math.trunc(dias)), percentual };
      })
      .filter((x): x is ParcelaCondicao => x !== null);
    if (out.length > 0) return out;
  }
  if (splitsFallback.length > 0) return parcelasDeSplits(splitsFallback);
  return [];
}
