/**
 * Bloco 4 — "proposta com prazo" (módulo puro, sem Supabase/React).
 *
 * Duas dores que ele resolve:
 *  P1 — rascunho parado: proposta criada e esquecida em `rascunho`.
 *  P2 — proposta vencida: `sent_at + validity_days` já passou e ela continua
 *       "enviada" para sempre — o cliente pode aceitar preço que não vale mais.
 *
 * "Vencida" é estado DERIVADO (o enum `proposal_status` não muda): a data de
 * validade sai de `prorrogada_ate` quando houver prorrogação, senão de
 * `sent_at + validity_days`.
 */

/** Validade padrão quando a proposta não define `validity_days`. */
export const VALIDADE_PADRAO_DIAS = 15;

/** Horas úteis sem toque para o Xerife cobrar um rascunho parado (3 dias úteis). */
export const P1_HORAS_RASCUNHO = 30;
/** Horas úteis de carência entre cobranças da mesma proposta vencida. */
export const P2_CARENCIA_HORAS = 50;

export type PropostaPrazo = {
  id?: string;
  status?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  validity_days?: number | null;
  prorrogada_ate?: string | null;
  vencida_em?: string | null;
};

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** yyyy-mm-dd → fim do dia (23:59:59.999Z): a proposta vale o dia inteiro. */
function fimDoDia(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
}

/**
 * Data-limite da proposta (ms epoch) ou `null` quando não dá para calcular
 * (proposta nunca enviada e sem prorrogação).
 */
export function dataValidade(p: PropostaPrazo): number | null {
  if (p.prorrogada_ate) {
    const t = fimDoDia(p.prorrogada_ate);
    if (t != null) return t;
  }
  const enviada = ts(p.sent_at);
  if (enviada == null) return null;
  const dias = Number(p.validity_days ?? VALIDADE_PADRAO_DIAS);
  const d = Number.isFinite(dias) && dias > 0 ? dias : VALIDADE_PADRAO_DIAS;
  return enviada + d * 86_400_000;
}

/** Status que ainda podem vencer (proposta viva aguardando o cliente). */
export const STATUS_PODE_VENCER = ["enviada", "aguardando_aprovacao"] as const;

/** A proposta está vencida agora? (estado derivado) */
export function propostaVencida(p: PropostaPrazo, now: Date = new Date()): boolean {
  if (!(STATUS_PODE_VENCER as readonly string[]).includes(p.status ?? "")) return false;
  const limite = dataValidade(p);
  if (limite == null) return false;
  return now.getTime() > limite;
}

/** Dias corridos (piso) desde o vencimento; 0 quando não venceu. */
export function diasVencida(p: PropostaPrazo, now: Date = new Date()): number {
  const limite = dataValidade(p);
  if (limite == null) return 0;
  return Math.max(0, Math.floor((now.getTime() - limite) / 86_400_000));
}

/** Data de validade em yyyy-mm-dd (para exibir/gravar), ou null. */
export function validadeYmd(p: PropostaPrazo): string | null {
  const t = dataValidade(p);
  if (t == null) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * P1 — rascunho parado: em `rascunho` e sem toque desde `limiteMs`
 * (o motor calcula o limite em horas ÚTEIS). Leads terminais são tratados lá.
 */
export function rascunhoParado(p: PropostaPrazo, limiteMs: number): boolean {
  if (p.status !== "rascunho") return false;
  const t = ts(p.updated_at) ?? ts(p.created_at);
  if (t == null) return false;
  return t < limiteMs;
}

/** Tag que liga a tarefa à proposta (leitura humana; o vínculo real é `proposta_id`). */
export function tagProposta(propostaId: string): string {
  return `[proposta:${propostaId}]`;
}

/** dd/mm a partir de yyyy-mm-dd ou ISO. */
export function ddmmProposta(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}` : null;
}
