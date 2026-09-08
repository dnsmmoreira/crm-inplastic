/**
 * Regras puras de "conversa sem próximo ato" (Bloco 3).
 *
 * A6 — conversa que ficou com a IA e o cliente parou de ser atendido.
 * A7 — conversa humana parada: ninguém encerrou, colocou em espera nem
 *      combinou retorno.
 *
 * Só cálculo: quem lê o banco é o `xerife-engine`.
 */
import { subtractBusinessHours, type BusinessWindow } from "@/lib/xerife/businessTime.server";

export type ConversaRegra = {
  id?: string;
  status: string | null;
  ia_ativa?: boolean | null;
  lead_id?: string | null;
  atribuido_para?: string | null;
  em_espera_desde?: string | null;
  last_message_at?: string | null;
};

export type LeadRegra = {
  stage?: string | null;
  next_followup?: string | null;
} | null;

/** Janelas (horas ÚTEIS) — mesmas unidades do resto do Xerife. */
export const A6_HORAS_IA = 4;
export const A6_HORAS_AGUARDANDO_HUMANO = 1;
/** Conversas mortas há mais de 30 dias corridos não são mais cobradas. */
export const A6_JANELA_DIAS = 30;
export const A7_HORAS_PARADA = 30; // 3 dias úteis

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Horas de janela úteis conforme o status da conversa (A6). */
export function janelaA6(status: string | null | undefined): number {
  return status === "aguardando_humano" ? A6_HORAS_AGUARDANDO_HUMANO : A6_HORAS_IA;
}

/** A6: conversa abandonada com a IA ligada, dentro dos últimos 30 dias. */
export function conversaAbandonadaPelaIA(
  conv: ConversaRegra,
  now: Date,
  win: BusinessWindow,
): boolean {
  if (conv.status !== "ia_atendendo" && conv.status !== "aguardando_humano") return false;
  if (conv.ia_ativa !== true) return false;
  const t = ts(conv.last_message_at);
  if (t == null) return false;
  const limite = subtractBusinessHours(janelaA6(conv.status), win, now).getTime();
  if (t >= limite) return false;
  return t >= now.getTime() - A6_JANELA_DIAS * 86_400_000;
}

/** A7: conversa humana parada, sem encerramento, espera ou retorno combinado. */
export function conversaHumanaParada(
  conv: ConversaRegra,
  lead: LeadRegra,
  now: Date,
  win: BusinessWindow,
): boolean {
  if (conv.status !== "humano_atendendo") return false;
  if (!conv.atribuido_para) return false;
  if (conv.em_espera_desde) return false;
  const t = ts(conv.last_message_at);
  if (t == null) return false;
  if (t >= subtractBusinessHours(A7_HORAS_PARADA, win, now).getTime()) return false;
  if (lead) {
    if (lead.stage === "ganho" || lead.stage === "perdido") return false;
    const nf = ts(lead.next_followup);
    if (nf != null && nf > now.getTime()) return false;
  }
  return true;
}

/** Dias corridos (piso) desde um instante — usado nos títulos das tarefas. */
export function diasParada(iso: string | null | undefined, now: Date): number {
  const t = ts(iso);
  if (t == null) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Horas corridas (piso) desde um instante. */
export function horasParada(iso: string | null | undefined, now: Date): number {
  const t = ts(iso);
  if (t == null) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/** Tag que liga a tarefa à conversa (o trigger de encerramento lê daqui). */
export function tagConversa(conversaId: string): string {
  return `[conversa:${conversaId}]`;
}

/** Extrai o id da conversa da descrição da tarefa. */
export function conversaIdDaDescricao(descricao: string | null | undefined): string | null {
  if (!descricao) return null;
  const m = /\[conversa:([0-9a-fA-F-]{36})\]/.exec(descricao);
  return m ? m[1] : null;
}
