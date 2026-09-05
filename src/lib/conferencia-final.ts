/**
 * Conferência final da proposta — checklist obrigatório ANTES de gerar/solicitar
 * o pedido. É uma etapa de revisão humana (erro de digitação: CNPJ, endereço,
 * condição de pagamento), independente das regras de aprovação financeira.
 *
 * Estado é sempre efêmero: nasce zerado a cada abertura do modal.
 */

export type ConferenciaEntry = {
  id: string;
  label: string;
  detail: string;
  grupo: "item" | "geral";
};

export type ConferenciaItemInput = {
  id: string;
  description: string;
  sku?: string | null;
  ncm?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type ConferenciaInput = {
  items: ConferenciaItemInput[];
  cliente: { razaoSocial?: string | null; documento?: string | null };
  condicao: { label?: string | null; parcelas?: string | null };
  transporte: { freightPayer: string; carrier?: string | null; endereco?: string | null };
  descontoPercent: number;
  /** % de acréscimo do cartão parcelado (0 quando não houver). */
  acrescimoPercent?: number;
  /** Nº de parcelas do cartão, quando a condição for cartão. */
  cartaoParcelas?: number | null;
  validadeDias: number;
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0,
  );

const ou = (v: string | null | undefined, fallback: string) => {
  const s = (v ?? "").toString().trim();
  return s.length > 0 ? s : fallback;
};

/** Linhas do checklist — uma por item + as de dados gerais. */
export function buildConferenciaEntries(input: ConferenciaInput): ConferenciaEntry[] {
  const itens: ConferenciaEntry[] = input.items.map((it) => ({
    id: `item:${it.id}`,
    grupo: "item",
    label: ou(it.description, "Item sem descrição"),
    detail: [
      it.sku ? `SKU ${it.sku}` : null,
      `${it.quantity} ${ou(it.unit, "un")}`,
      `${brl(it.unitPrice)} / un`,
      `Total ${brl(it.quantity * it.unitPrice)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const gerais: ConferenciaEntry[] = [
    {
      id: "geral:cliente",
      grupo: "geral",
      label: "Dados do cliente",
      detail: `${ou(input.cliente.razaoSocial, "Razão social não informada")} · ${ou(
        input.cliente.documento,
        "CNPJ/CPF não informado",
      )}`,
    },
    {
      id: "geral:condicao",
      grupo: "geral",
      label: "Condição de pagamento",
      detail: `${ou(input.condicao.label, "Condição não selecionada")}${
        input.condicao.parcelas ? ` · ${input.condicao.parcelas}` : ""
      }`,
    },
    {
      id: "geral:transporte",
      grupo: "geral",
      label: "Transporte / frete",
      detail: `${input.transporte.freightPayer} · ${ou(
        input.transporte.carrier,
        "Transportadora não informada",
      )} · ${ou(input.transporte.endereco, "Endereço de entrega não informado")}`,
    },
    {
      id: "geral:desconto",
      grupo: "geral",
      label: "Desconto aplicado",
      detail:
        input.descontoPercent > 0
          ? `${String(input.descontoPercent).replace(".", ",")}% sobre o subtotal`
          : "Sem desconto",
    },
    {
      id: "geral:acrescimo",
      grupo: "geral",
      label: "Acréscimo do cartão",
      detail:
        (input.acrescimoPercent ?? 0) > 0
          ? `${input.cartaoParcelas ? `${input.cartaoParcelas}x · ` : ""}+${String(
              input.acrescimoPercent,
            ).replace(".", ",")}% sobre o valor com desconto`
          : "Sem acréscimo",
    },
    {
      id: "geral:validade",
      grupo: "geral",
      label: "Validade da proposta",
      detail: `${input.validadeDias} dia(s)`,
    },
  ];

  return [...itens, ...gerais];
}

/** Estado inicial — sempre zerado (nada é persistido entre aberturas). */
export function estadoInicialConferencia(): Record<string, boolean> {
  return {};
}

export function alternarConferencia(
  marcados: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  return { ...marcados, [id]: !marcados[id] };
}

export function contarConfirmados(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
): number {
  return entries.filter((e) => marcados[e.id] === true).length;
}

/** Só libera o botão quando TODAS as linhas estiverem confirmadas. */
export function todosConfirmados(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
): boolean {
  return entries.length > 0 && entries.every((e) => marcados[e.id] === true);
}

/**
 * Índice da entrada "atual" no fluxo sequencial: a primeira ainda não confirmada.
 * Retorna entries.length quando tudo já foi confirmado.
 */
export function indiceAtual(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
): number {
  const i = entries.findIndex((e) => marcados[e.id] !== true);
  return i === -1 ? entries.length : i;
}

export type EstadoEntrada = "confirmado" | "atual" | "bloqueado";

export function estadoDaEntrada(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
  index: number,
): EstadoEntrada {
  const atual = indiceAtual(entries, marcados);
  if (index < atual) return "confirmado";
  if (index === atual) return "atual";
  return "bloqueado";
}

/** Confirma a entrada atual (ignora cliques em entradas bloqueadas). */
export function confirmarEntrada(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return marcados;
  if (estadoDaEntrada(entries, marcados, index) !== "atual") return marcados;
  return { ...marcados, [id]: true };
}

/**
 * Reabre uma entrada já confirmada para correção: ela volta a ser a "atual" e
 * todas as posteriores voltam a ficar bloqueadas.
 */
export function reabrirEntrada(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return marcados;
  const next: Record<string, boolean> = { ...marcados };
  for (const e of entries.slice(index)) delete next[e.id];
  return next;
}

/** Clique numa linha: confirma se for a atual, reabre se já confirmada, ignora se bloqueada. */
export function acionarEntrada(
  entries: ConferenciaEntry[],
  marcados: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return marcados;
  const estado = estadoDaEntrada(entries, marcados, index);
  if (estado === "confirmado") return reabrirEntrada(entries, marcados, id);
  if (estado === "atual") return confirmarEntrada(entries, marcados, id);
  return marcados;
}

