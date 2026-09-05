/**
 * Simulação de parcelamento no cartão de crédito.
 *
 * Regra comercial: a operadora cobra uma taxa POR PARCELA ADICIONAL. Em 1x não
 * há acréscimo; a partir de 2x o fator é composto (juros sobre juros) ou
 * simples, conforme a configuração da condição de pagamento.
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
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Fator multiplicador do total para `n` parcelas. */
export function fatorCartao(n: number, taxaPercent: number, compostos = true): number {
  const parcelas = Math.max(1, Math.trunc(Number(n) || 1));
  const taxa = Math.max(0, Number(taxaPercent) || 0) / 100;
  if (parcelas <= 1 || taxa === 0) return 1;
  return compostos ? Math.pow(1 + taxa, parcelas - 1) : 1 + (parcelas - 1) * taxa;
}

/** Tabela 1x…maxParcelas com acréscimo, total e valor da parcela. */
export function simularCartao(input: {
  valorBase: number;
  taxaPercent: number;
  maxParcelas: number;
  compostos?: boolean;
}): SimulacaoLinha[] {
  const base = Math.max(0, Number(input.valorBase) || 0);
  const max = Math.max(1, Math.trunc(Number(input.maxParcelas) || 1));
  const compostos = input.compostos !== false;
  const out: SimulacaoLinha[] = [];
  for (let n = 1; n <= max; n++) {
    const fator = fatorCartao(n, input.taxaPercent, compostos);
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
export function ehCondicaoCartao(cond: {
  method?: string | null;
  maxParcelas?: number | null;
  jurosCompostos?: boolean | null;
} | null | undefined): boolean {
  if (!cond) return false;
  if (cond.method !== "Cartão") return false;
  return (
    (Number(cond.maxParcelas) || 0) > 0 ||
    cond.jurosCompostos === true ||
    cond.jurosCompostos === false
  );
}

/** Acréscimo que vale para a proposta: o gravado nela vence o da condição. */
export function acrescimoEfetivo(
  propostaPercent: number | null | undefined,
  condicaoPercent: number | null | undefined,
): number {
  const daProposta = Number(propostaPercent) || 0;
  if (daProposta > 0) return daProposta;
  return Math.max(0, Number(condicaoPercent) || 0);
}
