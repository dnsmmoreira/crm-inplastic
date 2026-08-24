/**
 * Histórico de compras do cliente (puro — sem acesso a banco).
 *
 * O agrupamento é por CNPJ do lead: o mesmo cliente costuma ter vários leads
 * (um por contato/origem), então contar só pelo `lead_id` subestima a relação.
 * Quando o lead não tem CNPJ, o chamador cai para o `lead_id` e marca o
 * resultado como PARCIAL.
 */

export type PedidoHistoricoRow = {
  id: string;
  number: string;
  created_at: string;
  total: number;
  stage: string;
  ocorrencias_abertas?: number;
};

export type HistoricoCliente = {
  /** true quando agrupou só por lead_id (lead sem CNPJ). */
  parcial: boolean;
  quantidade: number;
  valor_total: number;
  ultimo_em: string | null;
  tem_ocorrencia_aberta: boolean;
  primeira_compra: boolean;
  recentes: PedidoHistoricoRow[];
};

/** Só dígitos — CNPJ é comparado normalizado. */
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Resume os pedidos do cliente EXCLUINDO o pedido atual.
 * `rows` já vem do banco por conjunto de ids (uma consulta, nunca N+1).
 */
export function resumoHistoricoCliente(
  rows: PedidoHistoricoRow[],
  pedidoAtualId: string,
  parcial = false,
): HistoricoCliente {
  const outros = rows
    .filter((r) => r.id !== pedidoAtualId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    parcial,
    quantidade: outros.length,
    valor_total: +outros.reduce((s, r) => s + (Number(r.total) || 0), 0).toFixed(2),
    ultimo_em: outros[0]?.created_at ?? null,
    tem_ocorrencia_aberta: outros.some((r) => (r.ocorrencias_abertas ?? 0) > 0),
    primeira_compra: outros.length === 0,
    recentes: outros.slice(0, 5),
  };
}
