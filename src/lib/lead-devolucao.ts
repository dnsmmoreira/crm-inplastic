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

export type LeadDevolucao = {
  stage?: string | null;
  proposta_enviada_at?: string | null;
  next_followup?: string | null;
};

/** Dias corridos entre uma data ISO e agora (null quando não houver data). */
function diasCorridos(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

export type ContextoDevolucao = {
  /** O dono atual já é o vendedor da carteira deste cliente. */
  donoDaCarteira?: boolean;
  /** Existe pedido não cancelado ligado a este lead. */
  temPedidoAtivo?: boolean;
};

/**
 * O lead ainda pode ser devolvido à fila?
 *
 * Não devolvemos quem já está em cadência de proposta (A4): proposta enviada
 * nos últimos 15 dias, proposta aberta em `proposta`/`negociacao`, ou retorno
 * já agendado para o futuro.
 *
 * @param propostasAbertas quantidade de propostas com status `enviada` do lead
 */
export function elegivelParaDevolucao(
  lead: LeadDevolucao,
  propostasAbertas: number,
  now: Date,
  ctx: ContextoDevolucao = {},
): boolean {
  // A carteira é âncora: cliente do próprio dono nunca volta para a fila.
  if (ctx.donoDaCarteira) return false;
  // Pedido em andamento: quem atende o pedido continua atendendo o cliente.
  if (ctx.temPedidoAtivo) return false;

  const dias = diasCorridos(lead.proposta_enviada_at, now);
  if (dias != null && dias <= 15) return false;

  const emNegociacao = lead.stage === "proposta" || lead.stage === "negociacao";
  if (emNegociacao && propostasAbertas > 0) return false;

  if (lead.next_followup) {
    const t = new Date(lead.next_followup).getTime();
    if (!Number.isNaN(t) && t > now.getTime()) return false;
  }
  return true;
}
