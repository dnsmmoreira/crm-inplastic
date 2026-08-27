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
