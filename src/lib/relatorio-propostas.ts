/**
 * Agregações puras do relatório de propostas (Fase 2 do funil).
 * Nada de I/O aqui — o servidor busca as linhas e chama estas funções.
 */
import { ordemMotivo } from "@/lib/motivos-perda";

export type PropostaMetricaRow = {
  id: string;
  owner_id: string;
  status: string;
  total: number;
  created_at: string;
  sent_at: string | null;
  recusada_em: string | null;
  order_created_at: string | null;
  motivo_recusa: string | null;
};

export type MotivoRecusaAgregado = {
  motivo: string;
  total: number;
  valor: number;
};

export type ResumoPropostas = {
  enviadas: number;
  viraram_pedido: number;
  recusadas: number;
  em_aberto: number;
  valor_total: number;
  valor_pedido: number;
  valor_recusado: number;
  ticket_medio: number;
  conversao_pct: number | null;
  dias_medio_ate_pedido: number | null;
  dias_medio_ate_recusa: number | null;
};

const EM_ABERTO = ["rascunho", "enviada", "aguardando_aprovacao", "aprovada"];

function dias(de: string | null, ate: string | null): number | null {
  if (!de || !ate) return null;
  const d = (new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

function media(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function resumirPropostas(rows: readonly PropostaMetricaRow[]): ResumoPropostas {
  const pedido = rows.filter((r) => r.status === "pedido");
  const recusadas = rows.filter((r) => r.status === "recusada");
  const abertas = rows.filter((r) => EM_ABERTO.includes(r.status));
  const enviadas = rows.filter((r) => r.sent_at !== null).length;

  const valorTotal = rows.reduce((s, r) => s + r.total, 0);
  const valorPedido = pedido.reduce((s, r) => s + r.total, 0);
  const valorRecusado = recusadas.reduce((s, r) => s + r.total, 0);
  const decididas = pedido.length + recusadas.length;

  const atePedido = pedido
    .map((r) => dias(r.sent_at ?? r.created_at, r.order_created_at))
    .filter((d): d is number => d !== null);
  const ateRecusa = recusadas
    .map((r) => dias(r.sent_at ?? r.created_at, r.recusada_em))
    .filter((d): d is number => d !== null);

  return {
    enviadas,
    viraram_pedido: pedido.length,
    recusadas: recusadas.length,
    em_aberto: abertas.length,
    valor_total: valorTotal,
    valor_pedido: valorPedido,
    valor_recusado: valorRecusado,
    ticket_medio: rows.length > 0 ? valorTotal / rows.length : 0,
    conversao_pct: decididas > 0 ? (pedido.length / decididas) * 100 : null,
    dias_medio_ate_pedido: media(atePedido),
    dias_medio_ate_recusa: media(ateRecusa),
  };
}

/** Motivos de recusa, contagem e valor perdido, em ordem canônica. */
export function agruparMotivos(rows: readonly PropostaMetricaRow[]): MotivoRecusaAgregado[] {
  const map = new Map<string, MotivoRecusaAgregado>();
  for (const r of rows) {
    if (r.status !== "recusada") continue;
    const motivo = r.motivo_recusa?.trim() || "Não informado";
    const cur = map.get(motivo) ?? { motivo, total: 0, valor: 0 };
    cur.total += 1;
    cur.valor += r.total;
    map.set(motivo, cur);
  }
  return Array.from(map.values()).sort(
    (a, b) => ordemMotivo(a.motivo) - ordemMotivo(b.motivo) || b.total - a.total,
  );
}

/** Resumo por vendedor (owner_id), do maior valor de pedido para o menor. */
export function resumirPorVendedor(
  rows: readonly PropostaMetricaRow[],
): { owner_id: string; resumo: ResumoPropostas }[] {
  const porDono = new Map<string, PropostaMetricaRow[]>();
  for (const r of rows) {
    const arr = porDono.get(r.owner_id) ?? [];
    arr.push(r);
    porDono.set(r.owner_id, arr);
  }
  return Array.from(porDono.entries())
    .map(([owner_id, rs]) => ({ owner_id, resumo: resumirPropostas(rs) }))
    .sort((a, b) => b.resumo.valor_pedido - a.resumo.valor_pedido);
}
