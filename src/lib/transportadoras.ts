/**
 * Lógica pura de transportadoras.
 *
 * As duas opções especiais ("Cliente retira" / "Veículo próprio") NÃO são
 * transportadoras de verdade: nunca têm id e nunca entram na estatística de
 * sugestão.
 */

export const TRANSPORTADORA_CLIENTE_RETIRA = "Cliente retira";
export const TRANSPORTADORA_VEICULO_PROPRIO = "Veículo próprio";

export const OPCOES_ESPECIAIS_TRANSPORTE = [
  TRANSPORTADORA_CLIENTE_RETIRA,
  TRANSPORTADORA_VEICULO_PROPRIO,
] as const;

export function ehOpcaoEspecialTransporte(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const n = String(nome).trim().toLowerCase();
  return OPCOES_ESPECIAIS_TRANSPORTE.some((o) => o.toLowerCase() === n);
}

/** Amostra mínima para arriscar uma sugestão — abaixo disso não sugerimos nada. */
export const MIN_AMOSTRA_SUGESTAO = 2;

export type UsoTransportadora = {
  transportadoraId?: string | null;
  uf?: string | null;
};

export function normalizarUf(uf: string | null | undefined): string | null {
  if (!uf || typeof uf !== "string") return null;
  const v = uf.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

export type SugestaoTransportadora = {
  transportadoraId: string;
  usos: number;
} | null;

/**
 * Escolhe a transportadora mais usada em propostas de clientes do mesmo UF.
 * Retorna null quando não há id estruturado suficiente (histórico novo/sujo).
 */
export function escolherSugestaoTransportadora(
  usos: UsoTransportadora[],
  uf: string | null | undefined,
  minAmostra: number = MIN_AMOSTRA_SUGESTAO,
): SugestaoTransportadora {
  const alvo = normalizarUf(uf);
  if (!alvo) return null;

  const contagem = new Map<string, number>();
  for (const u of usos) {
    const id = typeof u.transportadoraId === "string" ? u.transportadoraId.trim() : "";
    if (!id) continue; // texto livre / opções especiais não contam
    if (normalizarUf(u.uf) !== alvo) continue;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }

  let melhorId: string | null = null;
  let melhorQtd = 0;
  for (const [id, qtd] of contagem) {
    if (qtd > melhorQtd) {
      melhorId = id;
      melhorQtd = qtd;
    }
  }

  if (!melhorId || melhorQtd < minAmostra) return null;
  return { transportadoraId: melhorId, usos: melhorQtd };
}
