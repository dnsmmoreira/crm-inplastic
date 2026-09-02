/**
 * Helpers puros do "Placar de processo" (relatório somente leitura).
 * Sem acesso a banco — usados pela server function e pelos testes.
 */

export const PERIODOS_PROCESSO = [30, 90, 180] as const;
export type PeriodoProcesso = (typeof PERIODOS_PROCESSO)[number];
export const PERIODO_PADRAO: PeriodoProcesso = 90;

/** Dias sem virar pedido/perdida a partir dos quais a proposta é "parada". */
export const DIAS_PROPOSTA_PARADA = 15;
/** Horas sem qualquer contato a partir das quais o lead entra na lista. */
export const HORAS_LEAD_SEM_CONTATO = 24;

export type ResumoDuracao = {
  /** Mediana em horas. `null` quando não há casos. */
  mediana: number | null;
  /** Média em horas. `null` quando não há casos. */
  media: number | null;
  /** Quantidade de casos que entrou no cálculo. */
  casos: number;
};

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

export function media(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, n) => s + n, 0) / valores.length;
}

export function resumoDuracao(valores: readonly number[]): ResumoDuracao {
  return { mediana: mediana(valores), media: media(valores), casos: valores.length };
}

/** Diferença em horas entre dois timestamps ISO; `null` se algum faltar/for inválido. */
export function horasEntre(
  inicio: string | null | undefined,
  fim: string | null | undefined,
): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / 3_600_000;
}

export const horasEmDias = (h: number) => h / 24;

/**
 * Proposta "parada": enviada há mais de `DIAS_PROPOSTA_PARADA` dias, sem pedido
 * gerado e sem ter virado perdida/recusada.
 */
export function propostaParada(
  p: { status: string; sent_at: string | null; temPedido: boolean },
  agora: Date = new Date(),
): boolean {
  if (p.status !== "enviada") return false;
  if (p.temPedido) return false;
  if (!p.sent_at) return false;
  const dias = (agora.getTime() - Date.parse(p.sent_at)) / 86_400_000;
  return Number.isFinite(dias) && dias > DIAS_PROPOSTA_PARADA;
}

/**
 * Lead sem primeiro contato: criado há mais de 24h, ainda aberto e sem nenhum
 * registro de contato (mesmos campos que a regra A1 do Xerife usa).
 */
export function leadSemPrimeiroContato(
  l: {
    stage: string;
    created_at: string;
    last_contact_at: string | null;
    last_interaction_at: string | null;
    temSaida?: boolean;
  },
  agora: Date = new Date(),
): boolean {
  if (l.stage === "ganho" || l.stage === "perdido") return false;
  if (l.last_contact_at || l.last_interaction_at || l.temSaida) return false;
  const horas = (agora.getTime() - Date.parse(l.created_at)) / 3_600_000;
  return Number.isFinite(horas) && horas > HORAS_LEAD_SEM_CONTATO;
}
