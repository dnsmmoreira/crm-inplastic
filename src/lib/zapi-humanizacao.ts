/**
 * (E1/E2) Humanização do envio automático da IA.
 * Funções puras — sem I/O, testáveis.
 */

export const ATRASO_MIN_MS = 20_000;
export const ATRASO_MAX_MS = 90_000;
export const TYPING_MAX_MS = 15_000;
/** ~1 caractere a cada 25ms (≈ 480 caracteres/min de digitação). */
export const TYPING_MS_POR_CARACTERE = 25;
export const TYPING_MIN_MS = 1_500;

/** Atraso humano uniforme entre 20s e 90s (por mensagem). */
export function calcularAtrasoMs(rand: number = Math.random()): number {
  const r = Number.isFinite(rand) ? Math.min(Math.max(rand, 0), 0.999999) : 0;
  return Math.round(ATRASO_MIN_MS + r * (ATRASO_MAX_MS - ATRASO_MIN_MS));
}

/** Tempo de "digitando" proporcional ao texto, com teto de 15s. */
export function calcularTypingMs(texto: string): number {
  const len = String(texto ?? "").length;
  const bruto = len * TYPING_MS_POR_CARACTERE;
  return Math.min(TYPING_MAX_MS, Math.max(TYPING_MIN_MS, bruto));
}

/**
 * O tempo de digitação é DESCONTADO do atraso (nunca somado):
 * espera silenciosa = atraso - typing (mínimo 0).
 */
export function calcularEsperaAntesDoTyping(atrasoMs: number, typingMs: number): number {
  return Math.max(0, atrasoMs - typingMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
