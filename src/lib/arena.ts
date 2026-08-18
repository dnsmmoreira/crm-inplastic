/**
 * ARENA — helpers puros (sem acesso a banco, testáveis).
 *
 * Governança: todo valor econômico aqui só é renderizado em telas admin-only.
 * Nada nesta camada decide nada sozinho — apenas calcula e devolve o cálculo.
 */

export type ArenaConfig = {
  id: number;
  custo_interno_teto_pct: number;
  comissao_logiscal_pct: number;
  comissao_kelly_pct: number;
  encargos_fator: number;
  base_calculo_default: string;
  base_calculo_logiscal: string;
  margem_minima_pct: number;
  piso_preco_pct: number;
  arena_orcamento_mensal: number;
  arena_cap_temporada: number;
  carencia_meses_default: number;
  rampa_metas: number[];
  meta_canal_representante: number;
  arena_data_inicio: string;
  temporada_meses: number;
  piso_rodada_ativo: boolean;
  piso_rodada_pace_pct: number;
  margem_piso_comercial_pct: number;
  custo_produto_pct_estimado: number;
  interno_custo_fixo_mensal: number;
  interno_custo_variavel_pct: number;
  rep_custo_fixo_incremental_mensal: number;
  rep_custo_variavel_pct: number;
};

export const ARENA_CATEGORIAS_CUSTO = [
  { id: "salario", label: "Salário" },
  { id: "encargos", label: "Encargos" },
  { id: "comissao", label: "Comissão" },
  { id: "beneficio", label: "Benefícios" },
  { id: "incremental_canal", label: "Custo incremental do canal" },
  { id: "outro", label: "Outros" },
] as const;

export const ARENA_LICITACAO_SITUACOES = [
  { id: "identificada", label: "Identificada" },
  { id: "habilitacao", label: "Habilitação" },
  { id: "proposta", label: "Proposta enviada" },
  { id: "pregao", label: "Pregão" },
  { id: "vitoria", label: "Vitória" },
  { id: "empenho", label: "Empenho" },
  { id: "recebida", label: "Recebida" },
  { id: "perdida", label: "Perdida" },
] as const;

export type ArenaLicitacaoSituacao = (typeof ARENA_LICITACAO_SITUACOES)[number]["id"];

/* ---------------------------------------------------------------- */
/* Rampa / carência                                                   */
/* ---------------------------------------------------------------- */

/** Rótulo da fase da rampa (1 = meses 1–2, 2 = meses 3–4, ...). 0 = meta plena. */
export function faseRampaLabel(fase: number, metas: number[] = []): string {
  if (!fase || fase <= 0) return "Meta plena";
  const de = fase * 2 - 1;
  const ate = fase * 2;
  const meta = metas[fase - 1];
  const valor = typeof meta === "number" ? ` · ${formatBRLCompact(meta)}` : "";
  return `Fase ${fase} · meses ${de}–${ate}${valor}`;
}

/** Data de término da carência a partir do início e da quantidade de meses. */
export function carenciaFim(inicio: string | null, meses: number): string | null {
  if (!inicio) return null;
  const [y, m, d] = inicio.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1 + Math.max(0, meses), d));
  return dt.toISOString().slice(0, 10);
}

export function emCarencia(inicio: string | null, meses: number, hoje = new Date()): boolean {
  const fim = carenciaFim(inicio, meses);
  if (!fim) return false;
  return hoje.toISOString().slice(0, 10) < fim;
}

/* ---------------------------------------------------------------- */
/* Temporada                                                          */
/* ---------------------------------------------------------------- */

export type Temporada = { numero: number; inicio: string; fim: string; vigente: boolean };

/**
 * Temporadas de N meses ancoradas em `dataInicio` (NÃO trimestre-calendário).
 * Antes de `dataInicio` nada é computado: retorna numero = 0 e vigente = false.
 */
export function temporadaAtual(dataInicio: string, meses: number, hoje = new Date()): Temporada {
  const [y, m, d] = dataInicio.split("-").map(Number);
  const anchor = Date.UTC(y ?? 2026, (m ?? 9) - 1, d ?? 1);
  const hojeUTC = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const passo = Math.max(1, meses);

  if (hojeUTC < anchor) {
    const fim = new Date(Date.UTC(y ?? 2026, (m ?? 9) - 1 + passo, d ?? 1));
    fim.setUTCDate(fim.getUTCDate() - 1);
    return { numero: 0, inicio: dataInicio, fim: fim.toISOString().slice(0, 10), vigente: false };
  }

  let idx = 0;
  for (;;) {
    const ini = new Date(Date.UTC(y ?? 2026, (m ?? 9) - 1 + idx * passo, d ?? 1));
    const prox = new Date(Date.UTC(y ?? 2026, (m ?? 9) - 1 + (idx + 1) * passo, d ?? 1));
    if (hojeUTC < prox.getTime()) {
      const fim = new Date(prox.getTime());
      fim.setUTCDate(fim.getUTCDate() - 1);
      return {
        numero: idx + 1,
        inicio: ini.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
        vigente: true,
      };
    }
    idx += 1;
    if (idx > 200) return { numero: idx, inicio: dataInicio, fim: dataInicio, vigente: true };
  }
}

/* ---------------------------------------------------------------- */
/* Margem de contribuição (C1)                                        */
/* ---------------------------------------------------------------- */

export type MargemInput = {
  /** Receita líquida considerada (base de cálculo configurada). */
  receita: number;
  /** Custo de produto em % da receita (0 = ainda não parametrizado no banco). */
  custoProdutoPct: number;
  /** Desconto concedido em % sobre a receita bruta. */
  descontoPct: number;
  /** Soma das comissões em % (Logiscal, representante, interno...). */
  comissoesPct: number;
  /** Outras variáveis em % (frete por conta, impostos variáveis, etc). */
  variaveisPct: number;
};

export type MargemResultado = {
  margemPct: number;
  margemValor: number;
  custoProdutoParametrizado: boolean;
  detalhe: { descontoPct: number; comissoesPct: number; variaveisPct: number; custoProdutoPct: number };
};

/**
 * Margem de contribuição em % — arquitetura pronta.
 * Enquanto `custoProdutoPct` = 0 (sem custo de produto no banco), o resultado é
 * uma margem comercial (sem CPV) e deve ser comparada ao piso comercial configurável.
 */
export function calcularMargem(i: MargemInput): MargemResultado {
  const margemPct =
    100 - (i.custoProdutoPct || 0) - (i.descontoPct || 0) - (i.comissoesPct || 0) - (i.variaveisPct || 0);
  return {
    margemPct,
    margemValor: (i.receita || 0) * (margemPct / 100),
    custoProdutoParametrizado: (i.custoProdutoPct || 0) > 0,
    detalhe: {
      descontoPct: i.descontoPct || 0,
      comissoesPct: i.comissoesPct || 0,
      variaveisPct: i.variaveisPct || 0,
      custoProdutoPct: i.custoProdutoPct || 0,
    },
  };
}

/* ---------------------------------------------------------------- */
/* Ponto de equilíbrio representante x interno (B5)                   */
/* ---------------------------------------------------------------- */

export type EquilibrioCenario = {
  cenario: "nova_contratacao" | "capacidade_ociosa";
  label: string;
  custoFixoIncremental: number;
  custoVariavelCanalPct: number;
  custoVariavelInternoPct: number;
  deltaVariavelPct: number;
  /** Faturamento mensal de equilíbrio. null quando o delta é <= 0 (não há cruzamento). */
  faturamentoEquilibrio: number | null;
  observacao: string;
};

/**
 * Ponto de equilíbrio = custo fixo incremental / (custo variável do canal − custo variável interno).
 * Sem decisão automática: devolve o cálculo dos dois cenários para leitura do gestor.
 */
export function calcularEquilibrio(cfg: {
  interno_custo_fixo_mensal: number;
  interno_custo_variavel_pct: number;
  rep_custo_variavel_pct: number;
  rep_custo_fixo_incremental_mensal: number;
}): EquilibrioCenario[] {
  const varInterno = Number(cfg.interno_custo_variavel_pct) || 0;
  const varCanal = Number(cfg.rep_custo_variavel_pct) || 0;
  const delta = (varCanal - varInterno) / 100;

  const mk = (
    cenario: EquilibrioCenario["cenario"],
    label: string,
    fixo: number,
    observacao: string,
  ): EquilibrioCenario => ({
    cenario,
    label,
    custoFixoIncremental: fixo,
    custoVariavelCanalPct: varCanal,
    custoVariavelInternoPct: varInterno,
    deltaVariavelPct: varCanal - varInterno,
    faturamentoEquilibrio: delta > 0 ? fixo / delta : null,
    observacao,
  });

  return [
    mk(
      "nova_contratacao",
      "Cenário 1 — nova contratação interna",
      Number(cfg.interno_custo_fixo_mensal) || 0,
      "Custo fixo incremental = salário + encargos + benefícios de um novo vendedor interno. Abaixo do ponto de equilíbrio o canal representante é mais barato.",
    ),
    mk(
      "capacidade_ociosa",
      "Cenário 2 — capacidade ociosa da equipe atual",
      Number(cfg.rep_custo_fixo_incremental_mensal) || 0,
      "Sem nova contratação, o custo fixo incremental tende a zero: nesse cenário o interno domina em praticamente qualquer volume, restando ao canal o acesso a mercado que a equipe não cobre.",
    ),
  ];
}

/* ---------------------------------------------------------------- */

export function formatBRLCompact(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

export function pct(v: number, casas = 1): string {
  return `${(Number(v) || 0).toFixed(casas)}%`;
}
