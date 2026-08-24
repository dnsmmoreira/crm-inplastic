/**
 * Cadência automática de follow-up por etapa do pedido.
 *
 * Módulo PURO (sem banco) para poder ser testado e reutilizado pelo engine
 * `xerife-pedidos`. Define, por etapa operacional:
 *  • os passos (em dias corridos parado na etapa) em que uma cobrança é gerada;
 *  • quem é cobrado em cada passo (grupo responsável);
 *  • quando o caso escala (gestão e, no último passo, diretoria).
 *
 * Regra de escalonamento (fixa e sem intervenção humana):
 *  passo 1 → tarefa para o grupo responsável pela etapa;
 *  passo 2 → tarefa + notificação na tela para o grupo responsável e gestão;
 *  passo 3 (último) → tudo do passo 2 + alerta para a diretoria.
 */

export type GrupoCadencia = "financeiro" | "operacional" | "vendedor";

export type CadenciaEtapa = {
  /** Dias corridos parado na etapa que disparam cada passo. */
  dias: number[];
  /** Quem é cobrado. */
  grupo: GrupoCadencia;
  /** Tipo da tarefa gerada (usado para dedupe e para a agenda). */
  tipo: string;
  /** O que a tarefa pede, em linguagem de operação. */
  acao: string;
};

export const CADENCIA_PEDIDO: Record<string, CadenciaEtapa> = {
  analise_financeira: {
    dias: [1, 2, 3],
    grupo: "financeiro",
    tipo: "cadencia_analise_financeira",
    acao: "Analisar e liberar (ou reprovar) o pedido",
  },
  aguardando_pagamento: {
    dias: [2, 5, 8],
    grupo: "vendedor",
    tipo: "cadencia_aguardando_pagamento",
    acao: "Cobrar o comprovante de pagamento com o cliente",
  },
  programacao: {
    dias: [1, 3, 5],
    grupo: "operacional",
    tipo: "cadencia_liberado",
    acao: "Programar a produção do pedido liberado",
  },
  em_producao: {
    dias: [3, 7, 12],
    grupo: "operacional",
    tipo: "cadencia_producao",
    acao: "Atualizar o andamento da produção e a previsão de entrega",
  },
  pronto: {
    dias: [2, 4],
    grupo: "operacional",
    tipo: "cadencia_coleta_entrega",
    acao: "Agendar coleta/entrega do pedido pronto",
  },
  faturado_em_rota: {
    dias: [3, 6],
    grupo: "vendedor",
    tipo: "cadencia_em_rota",
    acao: "Confirmar a entrega com o cliente e a transportadora",
  },
};

export type PassoCadencia = {
  stage: string;
  /** Dia da régua atingido (ex.: 3). */
  passo: number;
  /** 1-based: 1º, 2º, 3º toque. */
  nivel: number;
  /** É o último passo da régua da etapa? */
  ultimo: boolean;
  /** Notificar gestão na tela (a partir do 2º toque). */
  escalarGestao: boolean;
  /** Avisar a diretoria (somente no último toque). */
  escalarDiretoria: boolean;
  grupo: GrupoCadencia;
  tipo: string;
  acao: string;
  /** Régua completa, para exibir no texto da tarefa. */
  regua: number[];
  /** Origem da exceção aplicada, quando houver. */
  excecao?: "cliente" | "familia" | null;
};

/** Etapas que possuem cadência configurada. */
export function etapasComCadencia(): string[] {
  return Object.keys(CADENCIA_PEDIDO);
}

/**
 * Exceção de cadência: sobrescreve a régua e/ou o escalonamento à diretoria
 * para um cliente específico ou para uma família (tipo) de produto.
 * Precedência: cliente > família > padrão.
 */
export type CadenciaExcecao = {
  escopo: "cliente" | "familia";
  cliente_id?: string | null;
  familia?: string | null;
  stage: string;
  /** Régua alternativa em dias. `null`/vazio mantém a régua padrão da etapa. */
  dias?: number[] | null;
  escalar_diretoria?: boolean | null;
  ativo?: boolean;
};

export type CadenciaOverride = {
  dias?: number[] | null;
  escalarDiretoria?: boolean | null;
  fonte?: "cliente" | "familia" | null;
};

/** Normaliza uma régua vinda do banco: inteiros positivos, únicos e crescentes. */
export function normalizarRegua(dias: unknown): number[] | null {
  if (!Array.isArray(dias)) return null;
  const limpos = Array.from(
    new Set(
      dias
        .map((d) => Math.trunc(Number(d)))
        .filter((d) => Number.isFinite(d) && d > 0),
    ),
  ).sort((a, b) => a - b);
  return limpos.length ? limpos : null;
}

/**
 * Escolhe a exceção aplicável a um pedido, dado o cliente e as famílias dos
 * itens. Cliente vence família; família só entra se houver exatamente uma
 * exceção de família aplicável (evita ambiguidade em pedido misto — nesse caso
 * vale a de menor régua, a mais rígida).
 */
export function resolverExcecao(
  excecoes: CadenciaExcecao[],
  args: { stage: string; clienteId?: string | null; familias?: (string | null | undefined)[] },
): CadenciaOverride | null {
  const ativas = excecoes.filter((e) => e.ativo !== false && e.stage === args.stage);

  if (args.clienteId) {
    const porCliente = ativas.find(
      (e) => e.escopo === "cliente" && e.cliente_id === args.clienteId,
    );
    if (porCliente) {
      return {
        dias: normalizarRegua(porCliente.dias),
        escalarDiretoria: porCliente.escalar_diretoria ?? null,
        fonte: "cliente",
      };
    }
  }

  const familias = (args.familias ?? [])
    .filter((f): f is string => !!f && f.trim() !== "")
    .map((f) => f.trim().toLowerCase());
  if (familias.length) {
    const candidatas = ativas.filter(
      (e) => e.escopo === "familia" && familias.includes((e.familia ?? "").trim().toLowerCase()),
    );
    if (candidatas.length) {
      const escolhida = candidatas
        .slice()
        .sort((a, b) => {
          const ra = normalizarRegua(a.dias);
          const rb = normalizarRegua(b.dias);
          return (ra?.[0] ?? Infinity) - (rb?.[0] ?? Infinity);
        })[0]!;
      return {
        dias: normalizarRegua(escolhida.dias),
        escalarDiretoria: escolhida.escalar_diretoria ?? null,
        fonte: "familia",
      };
    }
  }

  return null;
}

/**
 * Qual passo da cadência se aplica a um pedido parado há `dias` na etapa.
 * Retorna `null` quando a etapa não tem cadência ou ainda está dentro do prazo.
 * `override` permite aplicar exceção por cliente/família sem alterar o padrão.
 */
export function passoCadencia(
  stage: string,
  dias: number,
  override?: CadenciaOverride | null,
): PassoCadencia | null {
  const cfg = CADENCIA_PEDIDO[stage];
  if (!cfg || !Number.isFinite(dias)) return null;

  const reguaOverride = normalizarRegua(override?.dias);
  const regua = reguaOverride ?? [...cfg.dias].sort((a, b) => a - b);
  let indice = -1;
  for (let i = 0; i < regua.length; i++) {
    if (dias >= regua[i]!) indice = i;
  }
  if (indice < 0) return null;

  const nivel = indice + 1;
  const ultimo = indice === regua.length - 1;
  const diretoriaPadrao = ultimo && regua.length > 1;
  const escalarDiretoria =
    override?.escalarDiretoria === false
      ? false
      : override?.escalarDiretoria === true
        ? ultimo
        : diretoriaPadrao;
  return {
    stage,
    passo: regua[indice]!,
    nivel,
    ultimo,
    escalarGestao: nivel >= 2,
    escalarDiretoria,
    grupo: cfg.grupo,
    tipo: cfg.tipo,
    acao: cfg.acao,
    regua,
    excecao: override?.fonte ?? null,
  };
}

/** Texto padronizado da tarefa gerada pela cadência. */
export function textoCadencia(
  p: PassoCadencia,
  args: { numero: string; label: string; dias: number },
): { titulo: string; descricao: string; prioridade: number } {
  const sufixo = p.escalarDiretoria
    ? " — ESCALADO À DIRETORIA"
    : p.escalarGestao
      ? " — ESCALADO À GESTÃO"
      : "";
  return {
    titulo: `${p.nivel}ª cobrança · ${args.label}: Pedido ${args.numero} há ${args.dias}d${sufixo}`,
    descricao:
      `${p.acao}. Pedido ${args.numero} está em "${args.label}" há ${args.dias} dias ` +
      `(régua ${p.regua.join("/")} dias, toque ${p.nivel}/${p.regua.length})` +
      (p.excecao ? ` — régua de exceção por ${p.excecao}.` : "."),
    prioridade: p.escalarDiretoria ? 0 : p.escalarGestao ? 1 : 2,
  };
}
