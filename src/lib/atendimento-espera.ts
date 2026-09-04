/**
 * Regras puras do "atendimento em espera" e da transferência de conversa.
 *
 * Espera = o atendente já respondeu o que precisava e está aguardando algo do
 * cliente (retorno de decisão, documento, etc.). Enquanto a conversa está em
 * espera ela NÃO conta como "cliente sem resposta" em nenhum indicador.
 *
 * Sem acesso a banco — usado pela UI, pelas server functions, pelo Xerife e
 * pelos testes.
 */

/** Horas em espera a partir das quais o sistema cobra uma posição do atendente. */
export const HORAS_ESPERA_LONGA = 4;

/** Chave da permissão granular que define quem pode atender WhatsApp. */
export const PERM_WHATSAPP_ATENDER = "whatsapp.atender";

export type ConversaEspera = {
  em_espera_desde?: string | null;
};

/** A conversa está em espera? */
export function estaEmEspera(c: ConversaEspera | null | undefined): boolean {
  return !!c?.em_espera_desde;
}

/** Horas decorridas desde um timestamp ISO; `null` quando ausente/inválido. */
export function horasDesdeIso(iso: string | null | undefined, agora: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (agora.getTime() - t) / 3_600_000;
}

/**
 * Tempo sem resposta do atendente, em horas.
 * Retorna `null` quando não há pendência: sem mensagem do cliente, vendedor já
 * respondeu depois dela, ou a conversa está em espera declarada.
 */
export function horasSemResposta(
  c: {
    ultima_msg_cliente_at?: string | null;
    ultima_msg_vendedor_at?: string | null;
    em_espera_desde?: string | null;
  },
  agora: Date = new Date(),
): number | null {
  if (estaEmEspera(c)) return null;
  if (!c.ultima_msg_cliente_at) return null;
  if (c.ultima_msg_vendedor_at && c.ultima_msg_vendedor_at >= c.ultima_msg_cliente_at) return null;
  return horasDesdeIso(c.ultima_msg_cliente_at, agora);
}

/** Rótulo curto de tempo sem resposta ("2h 10m", "3d"), ou "—". */
export function rotuloTempo(horas: number | null): string {
  if (horas === null || !Number.isFinite(horas) || horas < 0) return "—";
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))}m`;
  if (horas < 48) {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(horas / 24)}d`;
}

/**
 * Quem pode transferir a conversa: administrador, o responsável atual ou quem
 * tem a permissão de atendimento. Conversa sem dono pode ser transferida por
 * qualquer atendente.
 */
export function podeTransferirConversa(ator: {
  isAdmin: boolean;
  userId: string;
  podeAtender: boolean;
  donoAtual: string | null;
}): boolean {
  if (ator.isAdmin) return true;
  if (ator.donoAtual === ator.userId) return true;
  return ator.podeAtender && ator.donoAtual === null;
}

/** Quem pode colocar em espera / retomar: admin ou o responsável atual. */
export function podeGerenciarEspera(ator: {
  isAdmin: boolean;
  userId: string;
  donoAtual: string | null;
}): boolean {
  return ator.isAdmin || (!!ator.donoAtual && ator.donoAtual === ator.userId);
}

/** Espera longa demais: passou de `HORAS_ESPERA_LONGA` horas. */
export function esperaLonga(
  c: ConversaEspera,
  agora: Date = new Date(),
  limiteHoras: number = HORAS_ESPERA_LONGA,
): boolean {
  const h = horasDesdeIso(c.em_espera_desde ?? null, agora);
  return h !== null && h >= limiteHoras;
}

/**
 * Só cobra de novo depois de 24h desde o último aviso, para o alerta não virar
 * spam enquanto a espera legítima continua.
 */
export function deveCobrarEspera(
  params: { em_espera_desde: string | null; ultimoAvisoEm: string | null },
  agora: Date = new Date(),
  limiteHoras: number = HORAS_ESPERA_LONGA,
): boolean {
  if (!esperaLonga({ em_espera_desde: params.em_espera_desde }, agora, limiteHoras)) return false;
  const desdeAviso = horasDesdeIso(params.ultimoAvisoEm, agora);
  if (desdeAviso === null) return true;
  return desdeAviso >= 24;
}

/** Texto da bolha de sistema mostrada na thread enquanto a conversa está em espera. */
export function textoBolhaEspera(params: {
  em_espera_desde: string;
  nomeQuemColocou?: string | null;
}): string {
  const d = new Date(params.em_espera_desde);
  const hora = Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const por = params.nomeQuemColocou?.trim();
  return `Atendimento em espera desde ${hora} — aguardando cliente${por ? ` (colocado por ${por})` : ""}`;
}
