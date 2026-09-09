/**
 * Aviso prévio antes de devolver um lead abandonado à fila — regra pura.
 *
 * Ninguém perde um cliente sem ser avisado: o dono recebe um aviso e só na
 * rodada seguinte, passadas 24h corridas, o lead volta para a fila.
 */

export type DecisaoDevolucao = "avisar" | "esperar" | "devolver";

/**
 * @param avisoNas48h  já existe aviso registrado nas últimas 48h?
 * @param avisoNas24h  esse aviso é recente (menos de 24h)?
 */
export function decidirDevolucao(avisoNas48h: boolean, avisoNas24h: boolean): DecisaoDevolucao {
  if (!avisoNas48h) return "avisar";
  if (avisoNas24h) return "esperar";
  return "devolver";
}

export function textoAvisoDevolucao(empresa: string | null | undefined): string {
  return `O lead ${empresa?.trim() || "sem nome"} será devolvido à fila amanhã se não houver contato.`;
}
