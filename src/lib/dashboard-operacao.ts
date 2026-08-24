/** Limiar de "parado" usado nos dashboards operacionais (dias corridos na etapa). */
export const DIAS_PARADO_ALERTA = 3;

/** Dias corridos desde a última mudança de etapa do pedido. */
export function diasNaEtapa(p: { stage_changed_at: string }, agora = Date.now()): number {
  const t = new Date(p.stage_changed_at).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}
