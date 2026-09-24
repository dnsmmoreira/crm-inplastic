/**
 * Simulação de parcelamento no cartão de crédito.
 *
 * Modelo principal: tabela da operadora por nº de parcelas; ela retém a taxa do
 * total cobrado, então o fator é 1/(1 − taxa). Reserva (condição sem tabela):
 * (1 + base) × (1 + taxa)^(n−1), composto ou simples.
 *
 * Tudo aqui é puro (sem banco, sem React) para ser testável e reaproveitável
 * no cliente e no servidor.
 */

import type { ParcelaCondicao } from "@/lib/condicoes-comerciais";
import { percentuaisIguais } from "@/lib/condicoes-comerciais";

export type SimulacaoLinha = {
  parcelas: number;
  fator: number;
  acrescimoPercent: number;
  acrescimoValor: number;
  total: number;
  valorParcela: number;
  /** Acréscimo com 6 casas — é o que se grava na proposta para o total fechar ao centavo. */
  acrescimoPercentExato: number;
  /** Taxa retida pela operadora nesta quantidade de parcelas (só no modelo por tabela). */
  taxaOperadoraPercent?: number | null;
};

/** Taxa da operadora por nº de parcelas: {"1": 4.98, "2": 9.64, ...}. */
export type TaxasOperadora = Record<string, number>;

/** Normaliza o jsonb do banco; tabela vazia/ inválida vira null (usa a fórmula antiga). */
export function normalizarTaxasOperadora(raw: unknown): TaxasOperadora | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: TaxasOperadora = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    const t = Number(v);
    if (!Number.isInteger(n) || n < 1 || !Number.isFinite(t) || t < 0 || t >= 100) continue;
    out[String(n)] = t;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Taxa da tabela para `n` parcelas, ou null quando `n` não está na tabela. */
export function taxaOperadora(n: number, tabela: TaxasOperadora | null | undefined): number | null {
  if (!tabela) return null;
  const t = tabela[String(Math.trunc(Number(n)))];
  return typeof t === "number" && Number.isFinite(t) && t >= 0 && t < 100 ? t : null;
}

/**
 * Fator pelo modelo da operadora: ela retém a taxa DO TOTAL cobrado, então
 * fator = 1 / (1 − taxa). Retorna null (recusa) se `n` não existir na tabela —
 * nunca extrapola nem cai na fórmula.
 */
export function fatorCartaoOperadora(n: number, tabela: TaxasOperadora | null | undefined): number | null {
  const t = taxaOperadora(n, tabela);
  if (t === null) return null;
  return 1 / (1 - t / 100);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Fator multiplicador do total para `n` parcelas.
 *
 * `taxaBasePercent` é a taxa da operadora que incide já na 1x; `taxaPercent` é
 * a taxa por parcela adicional, composta (padrão) ou simples.
 * fator(n) = (1 + base) * (1 + taxa)^(n-1)
 */
export function fatorCartao(
  n: number,
  taxaPercent: number,
  compostos = true,
  taxaBasePercent = 0,
): number {
  const parcelas = Math.max(1, Math.trunc(Number(n) || 1));
  const taxa = Math.max(0, Number(taxaPercent) || 0) / 100;
  const base = Math.max(0, Number(taxaBasePercent) || 0) / 100;
  const adicional =
    parcelas <= 1 || taxa === 0
      ? 1
      : compostos
        ? Math.pow(1 + taxa, parcelas - 1)
        : 1 + (parcelas - 1) * taxa;
  return (1 + base) * adicional;
}

/** Tabela 1x…maxParcelas com acréscimo, total e valor da parcela. */
export function simularCartao(input: {
  valorBase: number;
  taxaPercent: number;
  maxParcelas: number;
  compostos?: boolean;
  taxaBasePercent?: number;
  /** Com tabela, só gera as parcelas presentes nela (até maxParcelas). */
  taxasOperadora?: TaxasOperadora | null;
}): SimulacaoLinha[] {
  const base = Math.max(0, Number(input.valorBase) || 0);
  const max = Math.max(1, Math.trunc(Number(input.maxParcelas) || 1));
  const compostos = input.compostos !== false;
  const tabela = normalizarTaxasOperadora(input.taxasOperadora);
  const out: SimulacaoLinha[] = [];
  for (let n = 1; n <= max; n++) {
    let fator: number;
    let taxaOp: number | null = null;
    if (tabela) {
      const f = fatorCartaoOperadora(n, tabela);
      if (f === null) continue; // fora da tabela: não oferece
      fator = f;
      taxaOp = taxaOperadora(n, tabela);
    } else {
      fator = fatorCartao(n, input.taxaPercent, compostos, input.taxaBasePercent ?? 0);
    }
    const acrescimoPercent = round2((fator - 1) * 100);
    const totalCents = Math.round(base * 100 * fator);
    const total = round2(totalCents / 100);
    const parcelaCents = Math.floor(totalCents / n);
    out.push({
      parcelas: n,
      fator,
      acrescimoPercent,
      acrescimoValor: round2(total - base),
      total,
      valorParcela: round2(parcelaCents / 100),
      acrescimoPercentExato: Math.round((fator - 1) * 100 * 1e6) / 1e6,
      taxaOperadoraPercent: taxaOp,
    });
  }
  return out;
}

/**
 * Valores de cada parcela (em reais) para um total — a última absorve a sobra
 * de arredondamento para a soma bater exatamente com o total.
 */
export function valoresParcelasCartao(total: number, n: number): number[] {
  const parcelas = Math.max(1, Math.trunc(Number(n) || 1));
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / parcelas);
  const out = Array.from({ length: parcelas }, () => base);
  out[parcelas - 1] = cents - base * (parcelas - 1);
  return out.map((c) => round2(c / 100));
}

/** Parcelas da proposta para `n` vezes: 0/30/60… dias, percentuais somando 100. */
export function gerarParcelasCartao(n: number): ParcelaCondicao[] {
  const parcelas = Math.max(1, Math.trunc(Number(n) || 1));
  const pcts = percentuaisIguais(parcelas);
  return pcts.map((percentual, i) => ({ dias: i * 30, percentual }));
}

/** A condição de pagamento é um cartão parcelável? */
export function ehCondicaoCartao(
  cond:
    | {
        method?: string | null;
        maxParcelas?: number | null;
        jurosCompostos?: boolean | null;
        cartaoTaxaBasePercent?: number | null;
      }
    | null
    | undefined,
): boolean {
  if (!cond || cond.method !== "Cartão") return false;
  return (Number(cond.maxParcelas) || 0) > 1;
}

/**
 * Acréscimo que vale para a proposta. Em cartão manda o que foi gravado na
 * proposta (a simulação escolhida — 1x é legitimamente 0%); nas demais
 * condições vale a taxa do catálogo.
 */
export function acrescimoEfetivo(
  propostaPercent: number | null | undefined,
  condicaoPercent: number | null | undefined,
  ehCartao = false,
): number {
  const daProposta = Math.max(0, Number(propostaPercent) || 0);
  if (ehCartao) return daProposta;
  if (daProposta > 0) return daProposta;
  return Math.max(0, Number(condicaoPercent) || 0);
}
