/**
 * Lógica pura de transportadoras.
 *
 * As opções especiais NÃO são transportadoras do cadastro: nunca têm id e nunca
 * entram na estatística de sugestão.
 *
 * "Cliente retira" / "Veículo próprio" = retirada (não há coleta).
 * "A Definir Pelo Cliente" = É coleta por transportadora; quem escolhe/informa
 * a empresa é o cliente. É uma decisão comercial EXPLÍCITA (não é omissão), então
 * conta como transportadora definida e NÃO cai na pendência `sem_transportadora`.
 */

export const TRANSPORTADORA_CLIENTE_RETIRA = "Cliente retira";
export const TRANSPORTADORA_VEICULO_PROPRIO = "Veículo próprio";
export const TRANSPORTADORA_A_DEFINIR_CLIENTE = "A Definir Pelo Cliente";

export const OPCOES_ESPECIAIS_TRANSPORTE = [
  TRANSPORTADORA_CLIENTE_RETIRA,
  TRANSPORTADORA_VEICULO_PROPRIO,
  TRANSPORTADORA_A_DEFINIR_CLIENTE,
] as const;

/** Opções especiais que significam retirada (sem transportadora nenhuma). */
export const OPCOES_ESPECIAIS_RETIRADA = [
  TRANSPORTADORA_CLIENTE_RETIRA,
  TRANSPORTADORA_VEICULO_PROPRIO,
] as const;

/** "A Definir Pelo Cliente" — coleta com a transportadora em aberto por decisão do cliente. */
export function ehTransportadoraADefinir(nome: string | null | undefined): boolean {
  return String(nome ?? "").trim().toLowerCase() === TRANSPORTADORA_A_DEFINIR_CLIENTE.toLowerCase();
}

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
