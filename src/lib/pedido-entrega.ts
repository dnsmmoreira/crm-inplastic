/**
 * Decisão de entrega (modalidade + transportadora) HERDADA da proposta.
 *
 * Regra de negócio (Denis, 14/09/2026): a tratativa comercial — inclusive quem
 * leva a mercadoria — é do VENDEDOR. O pedido nasce com a decisão já tomada,
 * em vez de pedir o dado ao operacional na etapa "Coleta / Entrega".
 *
 * Módulo PURO: usado na geração do pedido (servidor) e testável isoladamente.
 */

import { ehRetirada } from "@/lib/pedido-pendencias";

export type TransporteProposta = {
  carrier?: string | null;
  carrierTransportadoraId?: string | null;
  freightPayer?: string | null;
  retirada?: boolean | null;
} | null;

export type EntregaDerivada = {
  modalidade_entrega: "coleta" | "entrega_propria" | null;
  transportadora: string | null;
  /** id estruturado quando a proposta tinha transportadora do cadastro. */
  transportadoraId: string | null;
};

const txt = (v: unknown) => String(v ?? "").trim();

/**
 * Deriva a entrega do pedido a partir do transporte da proposta:
 * - retirada (Cliente retira / Veículo próprio) → entrega própria, sem transportadora;
 * - transportadora definida (nome e/ou id) → coleta com essa transportadora;
 * - nada definido → nulos (a pendência `sem_transportadora` impede chegar aqui).
 */
export function derivarEntregaDaProposta(transport: TransporteProposta): EntregaDerivada {
  if (ehRetirada({ carrier: transport?.carrier ?? null, retirada: transport?.retirada ?? null })) {
    return { modalidade_entrega: "entrega_propria", transportadora: null, transportadoraId: null };
  }

  const nome = txt(transport?.carrier);
  const id = txt(transport?.carrierTransportadoraId);
  if (nome || id) {
    return {
      modalidade_entrega: "coleta",
      transportadora: nome || null,
      transportadoraId: id || null,
    };
  }

  return { modalidade_entrega: null, transportadora: null, transportadoraId: null };
}
