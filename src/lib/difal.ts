/**
 * DIFAL (Diferencial de Alíquota do ICMS) — cálculo puro e testável.
 *
 * Regra de negócio fechada com a diretoria:
 * - UF de origem SEMPRE São Paulo (SP).
 * - Aplica quando o destinatário está SEM inscrição estadual preenchida,
 *   NÃO está marcado como isento de IE, e a UF de destino é diferente de SP.
 * - Base "por dentro" (Convênio ICMS 153/2015):
 *     Base_destino = Valor / (1 − aliq_interna)
 *     ICMS_destino = Base_destino × aliq_interna
 *     ICMS_origem  = Valor × aliq_interestadual
 *     DIFAL        = ICMS_destino − ICMS_origem
 * - Cálculo automático e TRAVADO: o vendedor não edita o valor.
 * - FCP (Fundo de Combate à Pobreza) está FORA de escopo por decisão da diretoria.
 */

export const UF_ORIGEM_DIFAL = "SP";

export type AliquotaUf = {
  uf: string;
  /** Alíquota interna do estado de destino, em % (ex.: 17 = 17%). */
  aliquota_interna: number;
  /** Alíquota interestadual saindo de SP, em % (7 ou 12). */
  aliquota_interestadual: number;
};

/**
 * Valores públicos de referência (setembro/2026). Ponto de partida para revisão
 * da contabilidade — a fonte da verdade é a tabela `difal_aliquotas` no banco,
 * editável pelo administrador. Isto é apenas fallback quando a leitura falha.
 */
export const DIFAL_ALIQUOTAS_PADRAO: AliquotaUf[] = [
  { uf: "AC", aliquota_interna: 19, aliquota_interestadual: 7 },
  { uf: "AL", aliquota_interna: 19, aliquota_interestadual: 7 },
  { uf: "AM", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "AP", aliquota_interna: 18, aliquota_interestadual: 7 },
  { uf: "BA", aliquota_interna: 20.5, aliquota_interestadual: 7 },
  { uf: "CE", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "DF", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "ES", aliquota_interna: 17, aliquota_interestadual: 7 },
  { uf: "GO", aliquota_interna: 19, aliquota_interestadual: 7 },
  { uf: "MA", aliquota_interna: 23, aliquota_interestadual: 7 },
  { uf: "MG", aliquota_interna: 18, aliquota_interestadual: 12 },
  { uf: "MS", aliquota_interna: 17, aliquota_interestadual: 7 },
  { uf: "MT", aliquota_interna: 17, aliquota_interestadual: 7 },
  { uf: "PA", aliquota_interna: 19, aliquota_interestadual: 7 },
  { uf: "PB", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "PE", aliquota_interna: 20.5, aliquota_interestadual: 7 },
  { uf: "PI", aliquota_interna: 22.5, aliquota_interestadual: 7 },
  { uf: "PR", aliquota_interna: 19.5, aliquota_interestadual: 12 },
  { uf: "RJ", aliquota_interna: 20, aliquota_interestadual: 12 },
  { uf: "RN", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "RO", aliquota_interna: 19.5, aliquota_interestadual: 7 },
  { uf: "RR", aliquota_interna: 20, aliquota_interestadual: 7 },
  { uf: "RS", aliquota_interna: 17, aliquota_interestadual: 12 },
  { uf: "SC", aliquota_interna: 17, aliquota_interestadual: 12 },
  { uf: "SE", aliquota_interna: 19, aliquota_interestadual: 7 },
  { uf: "SP", aliquota_interna: 18, aliquota_interestadual: 0 },
  { uf: "TO", aliquota_interna: 20, aliquota_interestadual: 7 },
];

export type DifalEntrada = {
  /** Valor da operação: subtotal com desconto/acréscimo, ANTES do frete. */
  valorOperacao: number;
  /** UF de destino (endereço de entrega do cliente/lead). */
  ufDestino?: string | null;
  /** Inscrição estadual do destinatário (vazio = sem IE). */
  inscricaoEstadual?: string | null;
  /** Destinatário marcado como isento de inscrição estadual. */
  ieIsento?: boolean | null;
  aliquotas?: AliquotaUf[];
};

export type DifalResultado = {
  aplica: boolean;
  motivo:
    | "aplicado"
    | "com_inscricao_estadual"
    | "isento_ie"
    | "uf_origem"
    | "uf_desconhecida"
    | "valor_zero";
  uf: string | null;
  aliquotaInterna: number;
  aliquotaInterestadual: number;
  baseDestino: number;
  icmsDestino: number;
  icmsOrigem: number;
  /** Valor do DIFAL somado ao total da proposta (2 casas). */
  valor: number;
};

const money = (n: number) => +(Math.round(n * 100) / 100).toFixed(2);

export function normalizarUf(uf?: string | null): string | null {
  const v = String(uf ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** Destinatário sem IE preenchida e não marcado como isento. */
export function semInscricaoEstadual(
  inscricaoEstadual?: string | null,
  ieIsento?: boolean | null,
): boolean {
  if (ieIsento) return false;
  const ie = String(inscricaoEstadual ?? "").trim();
  if (!ie) return true;
  return /^isent[oa]$/i.test(ie);
}

const vazio = (motivo: DifalResultado["motivo"], uf: string | null): DifalResultado => ({
  aplica: false,
  motivo,
  uf,
  aliquotaInterna: 0,
  aliquotaInterestadual: 0,
  baseDestino: 0,
  icmsDestino: 0,
  icmsOrigem: 0,
  valor: 0,
});

/** Calcula o DIFAL "por dentro". Nunca lança — devolve valor 0 quando não aplica. */
export function calcularDifal(e: DifalEntrada): DifalResultado {
  const uf = normalizarUf(e.ufDestino);
  if (e.ieIsento) return vazio("isento_ie", uf);
  if (!semInscricaoEstadual(e.inscricaoEstadual, e.ieIsento))
    return vazio("com_inscricao_estadual", uf);
  if (!uf) return vazio("uf_desconhecida", uf);
  if (uf === UF_ORIGEM_DIFAL) return vazio("uf_origem", uf);

  const tabela = e.aliquotas && e.aliquotas.length ? e.aliquotas : DIFAL_ALIQUOTAS_PADRAO;
  const linha = tabela.find((a) => normalizarUf(a.uf) === uf);
  if (!linha) return vazio("uf_desconhecida", uf);

  const interna = Number(linha.aliquota_interna) || 0;
  const inter = Number(linha.aliquota_interestadual) || 0;
  const valor = Number(e.valorOperacao) || 0;
  if (valor <= 0 || interna <= 0 || interna >= 100) return vazio("valor_zero", uf);

  const baseDestino = valor / (1 - interna / 100);
  const icmsDestino = baseDestino * (interna / 100);
  const icmsOrigem = valor * (inter / 100);
  const difal = Math.max(0, icmsDestino - icmsOrigem);

  return {
    aplica: difal > 0,
    motivo: "aplicado",
    uf,
    aliquotaInterna: interna,
    aliquotaInterestadual: inter,
    baseDestino: money(baseDestino),
    icmsDestino: money(icmsDestino),
    icmsOrigem: money(icmsOrigem),
    valor: money(difal),
  };
}

export const LABEL_DIFAL = "DIFAL (destinatário sem inscrição estadual)";
