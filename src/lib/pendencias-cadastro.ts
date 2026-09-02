/**
 * Funções puras da tela "Pendências de cadastro".
 * Ficam separadas da server function para poderem ser testadas isoladamente.
 */

export type CampoFaltandoProduto = "peso" | "altura" | "largura" | "comprimento";

/** Considera nulo/zero/negativo como "não informado". */
function vazio(v: number | null | undefined): boolean {
  return v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) <= 0;
}

/** Lista o que falta no cadastro do produto (vazia = produto completo). */
export function faltasDoProduto(p: {
  weight_kg?: number | null;
  height_cm?: number | null;
  width_cm?: number | null;
  length_cm?: number | null;
}): CampoFaltandoProduto[] {
  const faltas: CampoFaltandoProduto[] = [];
  if (vazio(p.weight_kg)) faltas.push("peso");
  if (vazio(p.height_cm)) faltas.push("altura");
  if (vazio(p.width_cm)) faltas.push("largura");
  if (vazio(p.length_cm)) faltas.push("comprimento");
  return faltas;
}

/** Dias corridos desde a data informada (0 quando inválida ou no futuro). */
export function diasParado(iso: string | null | undefined, agora = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}
