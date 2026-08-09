/**
 * (E4) Disjuntor de envios automáticos — regras puras (sem I/O).
 */

export const LIMITE_FALHAS = 5;
export const JANELA_FALHAS_MS = 10 * 60_000;
export const PAUSA_MS = 30 * 60_000;

/** Abre o disjuntor com 5 ou mais falhas dentro da janela. */
export function deveAbrirPorFalhas(qtdFalhasNaJanela: number): boolean {
  return qtdFalhasNaJanela >= LIMITE_FALHAS;
}

/** Conta apenas as falhas dentro da janela de 10 minutos. */
export function falhasNaJanela(timestampsMs: number[], agoraMs: number): number {
  return timestampsMs.filter((t) => agoraMs - t < JANELA_FALHAS_MS).length;
}

/** Pausa continua ativa enquanto agora < pausado_ate. */
export function pausaAtiva(pausadoAteIso: string | null | undefined, agoraMs: number): boolean {
  if (!pausadoAteIso) return false;
  const ate = Date.parse(pausadoAteIso);
  if (!Number.isFinite(ate)) return false;
  return agoraMs < ate;
}

export function calcularPausadoAte(agoraMs: number): string {
  return new Date(agoraMs + PAUSA_MS).toISOString();
}
