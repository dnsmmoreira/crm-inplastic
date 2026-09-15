/**
 * Faixas de tempo "parado" usadas nos cards do dashboard inicial.
 *
 * Regra (faixas mutuamente exclusivas — cada item entra em UMA faixa só):
 *  - 0 a 4 dias   → saudável (não entra em nenhuma faixa)
 *  - 5 a 14 dias  → atenção (âmbar)
 *  - 15 a 29 dias → alerta (laranja)
 *  - 30+ dias     → crítico (vermelho)
 *
 * Não altera nem depende de `leadTemperature`/`followupTemperature` — usa a
 * MESMA forma de calcular dias (diferença em dias corridos sobre a data de
 * referência), mas com faixas próprias.
 */

export type FaixaParadoId = "atencao" | "alerta" | "critico";

export type FaixaParadoDef = {
  id: FaixaParadoId;
  label: string;
  /** Classe de cor para badges/blocos (tokens Tailwind já usados no projeto). */
  className: string;
  /** Classe só do ponto/indicador. */
  dotClassName: string;
};

export const FAIXAS_PARADO: FaixaParadoDef[] = [
  {
    id: "atencao",
    label: "5–14 dias",
    className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    dotClassName: "bg-amber-500",
  },
  {
    id: "alerta",
    label: "15–29 dias",
    className: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    dotClassName: "bg-orange-500",
  },
  {
    id: "critico",
    label: "30+ dias",
    className: "bg-red-500/15 text-red-600 border-red-500/30",
    dotClassName: "bg-red-500",
  },
];

/** Dias corridos desde a data de referência (nunca negativo). */
export function diasParado(ref: string | null | undefined, agora: number = Date.now()): number {
  if (!ref) return 0;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86400000));
}

/** Faixa correspondente à quantidade de dias, ou null quando saudável (0–4). */
export function faixaParado(dias: number): FaixaParadoId | null {
  if (dias >= 30) return "critico";
  if (dias >= 15) return "alerta";
  if (dias >= 5) return "atencao";
  return null;
}

export type ResumoFaixas = Record<FaixaParadoId, { count: number; valor: number }>;

export function resumoFaixasVazio(): ResumoFaixas {
  return {
    atencao: { count: 0, valor: 0 },
    alerta: { count: 0, valor: 0 },
    critico: { count: 0, valor: 0 },
  };
}

/**
 * Agrega itens nas 3 faixas. `ref` é a data usada para medir o tempo parado e
 * `valor` (opcional) é somado por faixa.
 */
export function agruparPorFaixa<T>(
  itens: T[],
  ref: (item: T) => string | null | undefined,
  valor: (item: T) => number = () => 0,
  agora: number = Date.now(),
): ResumoFaixas {
  const out = resumoFaixasVazio();
  for (const item of itens) {
    const faixa = faixaParado(diasParado(ref(item), agora));
    if (!faixa) continue;
    out[faixa].count += 1;
    out[faixa].valor += valor(item) || 0;
  }
  return out;
}
