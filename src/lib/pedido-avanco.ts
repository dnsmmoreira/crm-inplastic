/**
 * Dados obrigatórios para o pedido AVANÇAR de etapa + prazo do pós-venda.
 *
 * Módulo PURO (sem Supabase, sem React, sem imports de servidor): usado na tela
 * (para pedir só o que falta) e no servidor (`updatePedidoStage`, que é quem
 * de fato valida — a UI apenas coleta).
 *
 * Dias úteis aqui são contados como dias de calendário Seg–Sex (a janela de
 * horário só importa para o motor do Xerife, que usa `businessTime.server`).
 */

import { podeAssumirPedido } from "@/lib/pedidos-stages";
import { ehRetirada } from "@/lib/pedido-pendencias";

export type CampoAvanco =
  | "previsao_entrega"
  | "modalidade_entrega"
  | "transportadora"
  | "nf_numero";

export const CAMPO_AVANCO_LABEL: Record<CampoAvanco, string> = {
  previsao_entrega: "Previsão de entrega",
  modalidade_entrega: "Modalidade (coleta ou entrega própria)",
  transportadora: "Transportadora",
  nf_numero: "Número da nota fiscal",
};

export type PedidoAvanco = {
  previsao_entrega?: string | null;
  modalidade_entrega?: string | null;
  transportadora?: string | null;
  nf_numero?: string | null;
};

const txt = (v: unknown) => String(v ?? "").trim();

/** Campos que a etapa de DESTINO exige para o pedido poder entrar nela. */
export function dadosExigidosParaEntrar(stage: string | null | undefined): CampoAvanco[] {
  if (stage === "em_producao") return ["previsao_entrega"];
  if (stage === "pronto") return ["modalidade_entrega", "transportadora"];
  if (stage === "faturado_em_rota") return ["nf_numero"];
  return [];
}

/** Campos que faltam no pedido para ele entrar em `stageAlvo`. */
export function faltamDados(
  pedido: PedidoAvanco | null | undefined,
  stageAlvo: string | null | undefined,
): Array<{ campo: CampoAvanco; label: string }> {
  const p = pedido ?? {};
  const out: Array<{ campo: CampoAvanco; label: string }> = [];
  const add = (campo: CampoAvanco) => out.push({ campo, label: CAMPO_AVANCO_LABEL[campo] });

  for (const campo of dadosExigidosParaEntrar(stageAlvo)) {
    if (campo === "transportadora") {
      // Só exigida quando o cliente NÃO retira e a modalidade é coleta.
      const modalidade = txt(p.modalidade_entrega) || "coleta";
      if (modalidade !== "coleta") continue;
      if (ehRetirada({ carrier: p.transportadora ?? null })) continue;
      if (!txt(p.transportadora)) add("transportadora");
      continue;
    }
    if (!txt(p[campo])) add(campo);
  }
  return out;
}

/**
 * Etapas operacionais exigem responsável: sair DE ou entrar EM uma delas sem
 * `responsavel_atual_id` é bloqueado no servidor.
 */
export function exigeResponsavel(stage: string | null | undefined): boolean {
  return podeAssumirPedido(String(stage ?? ""));
}

export const MSG_SEM_RESPONSAVEL = "Assuma o pedido antes de movê-lo.";

/* ------------------------------ Pós-venda -------------------------------- */

export type PedidoPosVenda = {
  entrega_comprovada_em?: string | null;
  comprovacao_dispensada_em?: string | null;
  pos_venda_contato_em?: string | null;
  encerrado_em?: string | null;
};

export function comprovacaoOk(p: PedidoPosVenda | null | undefined): boolean {
  return Boolean(p?.entrega_comprovada_em || p?.comprovacao_dispensada_em);
}

export function contatoOk(p: PedidoPosVenda | null | undefined): boolean {
  return Boolean(p?.pos_venda_contato_em);
}

/** Dias úteis (Seg–Sex) completos entre duas datas. */
export function diasUteisEntre(from: Date, to: Date): number {
  if (!(to > from)) return 0;
  let dias = 0;
  const cur = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0),
  );
  const fim = to.getTime();
  for (let guard = 0; guard < 4000; guard++) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getTime() > fim) break;
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) dias++;
  }
  return dias;
}

function prazoCumprido(
  entradaEm: string | Date | null | undefined,
  now: Date,
  diasUteis: number,
): boolean {
  if (!entradaEm) return false;
  const d = entradaEm instanceof Date ? entradaEm : new Date(entradaEm);
  if (Number.isNaN(d.getTime())) return false;
  return diasUteisEntre(d, now) >= diasUteis;
}

/**
 * O pedido pode encerrar sozinho: comprovação (comprovada OU dispensada),
 * contato de pós-venda registrado e prazo de dias úteis cumprido.
 */
export function posVendaPodeEncerrar(
  pedido: PedidoPosVenda | null | undefined,
  entradaEm: string | Date | null | undefined,
  now: Date,
  diasUteis: number,
): boolean {
  if (!pedido) return false;
  if (pedido.encerrado_em) return false;
  if (!comprovacaoOk(pedido)) return false;
  if (!contatoOk(pedido)) return false;
  return prazoCumprido(entradaEm, now, diasUteis);
}

export type PosVendaAtraso = {
  atrasado: boolean;
  faltaComprovacao: boolean;
  faltaContato: boolean;
  faltando: string[];
};

/** Passou do prazo e ainda falta comprovação e/ou contato. */
export function posVendaAtrasado(
  pedido: PedidoPosVenda | null | undefined,
  entradaEm: string | Date | null | undefined,
  now: Date,
  diasUteis: number,
): PosVendaAtraso {
  const faltaComprovacao = !comprovacaoOk(pedido);
  const faltaContato = !contatoOk(pedido);
  const noPrazo = prazoCumprido(entradaEm, now, diasUteis);
  const atrasado =
    Boolean(pedido) && !pedido?.encerrado_em && noPrazo && (faltaComprovacao || faltaContato);
  const faltando: string[] = [];
  if (atrasado && faltaComprovacao) faltando.push("comprovação de entrega");
  if (atrasado && faltaContato) faltando.push("contato de pós-venda");
  return { atrasado, faltaComprovacao, faltaContato, faltando };
}

/** Nota mínima ao registrar o contato de pós-venda. */
export const CONTATO_POS_VENDA_MIN_CHARS = 10;

export function contatoPosVendaValido(nota: string | null | undefined): boolean {
  return txt(nota).length >= CONTATO_POS_VENDA_MIN_CHARS;
}
