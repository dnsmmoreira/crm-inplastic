/**
 * Prazo de entrega do pedido — módulo puro (sem banco, testável).
 *
 * Dois prazos convivem:
 *  - `previsao_entrega`: veio da proposta, é o prazo ORIGINAL combinado na venda;
 *  - `prazo_real_entrega`: prazo RENEGOCIADO com o cliente, registrado pelo
 *    Operacional. Quando existe, ele manda em toda a lógica de atraso.
 *
 * Sem prazo real definido, o comportamento é exatamente o de antes.
 *
 * O prazo é tratado como DIA (sem hora): o pedido só está atrasado depois do
 * FIM do dia do prazo, no fuso de São Paulo.
 */

const SP_OFFSET = "-03:00";
const HORA_MS = 3_600_000;

export type PedidoComPrazo = {
  previsao_entrega?: string | null;
  prazo_real_entrega?: string | null;
};

/** Etapas em que não faz mais sentido cobrar prazo de entrega. */
export const STAGES_SEM_PRAZO: readonly string[] = [
  "pos_venda",
  "pedido_entregue",
  "concluido",
  "reprovado_financeiro",
  "cancelado",
];

export function prazoCobravel(stage: string | null | undefined): boolean {
  return !!stage && !STAGES_SEM_PRAZO.includes(stage);
}

/** Prazo que vale: o real quando existir, senão o original da proposta. */
export function prazoEfetivo(p: PedidoComPrazo): string | null {
  const real = (p.prazo_real_entrega ?? "").trim();
  if (real) return real;
  const orig = (p.previsao_entrega ?? "").trim();
  return orig || null;
}

/** true quando o prazo em vigor é o renegociado pelo Operacional. */
export function usandoPrazoReal(p: PedidoComPrazo): boolean {
  return !!(p.prazo_real_entrega ?? "").trim();
}

/**
 * Instante-limite: fim do dia do prazo em São Paulo.
 * Aceita tanto `YYYY-MM-DD` (coluna date) quanto timestamp ISO.
 */
export function limiteDoPrazo(valor: string | null | undefined): Date | null {
  const v = (valor ?? "").trim();
  if (v.length < 10) return null;
  const dia = v.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const t = Date.parse(`${dia}T23:59:59.999${SP_OFFSET}`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Horas que faltam até o fim do dia do prazo (negativo = já estourou). */
export function horasAteOPrazo(p: PedidoComPrazo, now: Date = new Date()): number | null {
  const lim = limiteDoPrazo(prazoEfetivo(p));
  if (!lim) return null;
  return (lim.getTime() - now.getTime()) / HORA_MS;
}

/** Pedido atrasado: passou do fim do dia do prazo e a etapa ainda cobra prazo. */
export function pedidoAtrasado(
  p: PedidoComPrazo & { stage?: string | null },
  now: Date = new Date(),
): boolean {
  if (p.stage !== undefined && !prazoCobravel(p.stage)) return false;
  const h = horasAteOPrazo(p, now);
  return h !== null && h < 0;
}

/** Ainda não atrasado, mas o prazo vence em `horas` ou menos (default 48h). */
export function prazoAVencer(
  p: PedidoComPrazo & { stage?: string | null },
  now: Date = new Date(),
  horas = 48,
): boolean {
  if (p.stage !== undefined && !prazoCobravel(p.stage)) return false;
  const h = horasAteOPrazo(p, now);
  return h !== null && h >= 0 && h <= horas;
}

/** dd/MM/yyyy do prazo, para mensagens e avisos. */
export function formatarPrazo(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  if (v.length < 10) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
