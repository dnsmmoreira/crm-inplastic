/**
 * "Nada fica sem próximo ato" — condição de morte das tarefas automáticas.
 *
 * Módulo PURO (sem Supabase, sem React): mapeia quais tipos de tarefa perdem o
 * sentido quando o pedido muda de etapa (ou quando o lead é encerrado) e gera o
 * texto do motivo gravado em `tarefas.desfecho_detalhe`.
 *
 * Toda tarefa encerrada pelo sistema recebe:
 *   status='concluida', concluida_at=now(), desfecho='automatico',
 *   desfecho_detalhe='<motivo>'.
 */

import { stageLabel } from "@/lib/pedidos-stages";

/** Desfecho gravado quando quem encerra é o sistema, não uma pessoa. */
export const DESFECHO_AUTOMATICO = "automatico" as const;

/** Tipos de tarefa que existem por causa da ETAPA em que o pedido está. */
export const TIPOS_POR_ETAPA_PEDIDO: Record<string, string[]> = {
  analise_financeira: ["aprovacao_pendente", "cadencia_analise_financeira"],
  aguardando_pagamento: ["aguardando_pagamento", "cadencia_aguardando_pagamento"],
  programacao: ["cadencia_liberado"],
  em_producao: ["acompanhar_producao", "cadencia_producao"],
  pronto: ["cadencia_coleta_entrega", "combinar_coleta"],
  faturado_em_rota: ["cadencia_em_rota", "nf_atrasada"],
  pos_venda: [
    "pos_venda_pedido",
    "pos_venda_confirmacao",
    "pos_venda_satisfacao",
    "pos_venda_recompra",
    "comprovacao_entrega",
    "pos_venda_atrasado",
  ],
};

/** Tipos de tarefa que só fazem sentido enquanto o pedido está andando. */
export const TIPOS_ACOMPANHAMENTO_PEDIDO = [
  "previsao_atrasada",
  "prazo_a_vencer",
  "pedido_travado",
];

/** Etapas terminais: o pedido morreu, nada mais é cobrável nele. */
export const ETAPAS_TERMINAIS_PEDIDO = ["cancelado", "reprovado_financeiro"];

/** Todos os tipos de tarefa ligados a pedido. */
export function todosTiposPedido(): string[] {
  const set = new Set<string>(TIPOS_ACOMPANHAMENTO_PEDIDO);
  for (const lista of Object.values(TIPOS_POR_ETAPA_PEDIDO)) for (const t of lista) set.add(t);
  set.add("ocorrencia_aberta");
  return [...set];
}

/** Tipos que morrem porque o pedido DEIXOU esta etapa. */
export function tiposQueMorremAoSairDe(stage: string | null | undefined): string[] {
  if (!stage) return [];
  return TIPOS_POR_ETAPA_PEDIDO[stage] ?? [];
}

/** Tipos que morrem porque o pedido ENTROU nesta etapa. */
export function tiposQueMorremAoEntrarEm(stage: string | null | undefined): string[] {
  if (!stage) return [];
  if (ETAPAS_TERMINAIS_PEDIDO.includes(stage)) return todosTiposPedido();
  if (stage === "pos_venda") return [...TIPOS_ACOMPANHAMENTO_PEDIDO];
  return [];
}

/** União de sair-de + entrar-em, sem repetição e sem os tipos da etapa atual. */
export function tiposParaEncerrarNaTransicao(
  de: string | null | undefined,
  para: string | null | undefined,
): string[] {
  const manter = new Set(
    ETAPAS_TERMINAIS_PEDIDO.includes(para ?? "") ? [] : (TIPOS_POR_ETAPA_PEDIDO[para ?? ""] ?? []),
  );
  const alvo = new Set<string>([...tiposQueMorremAoSairDe(de), ...tiposQueMorremAoEntrarEm(para)]);
  for (const t of manter) alvo.delete(t);
  return [...alvo];
}

/** Tipos de cobrança comercial de LEAD (o trigger do banco usa a mesma lista). */
export const TIPOS_COMERCIAIS_LEAD = [
  "follow_up",
  "retomar_contato",
  "primeiro_contato",
  "resposta_pendente",
  "cadencia_proposta",
  "reativacao_lead",
  "resgate_carteira",
  "retorno_agendado",
];

export type MotivoEncerramento =
  | { causa: "pedido_saiu"; stage: string }
  | { causa: "pedido_entrou"; stage: string }
  | { causa: "lead_encerrado"; stage: "ganho" | "perdido" }
  | { causa: "lead_avancou"; stage: string }
  | { causa: "primeiro_contato" }
  | { causa: "cliente_respondido" }
  | { causa: "contato_retomado" }
  | { causa: "entrega_comprovada" }
  | { causa: "comprovacao_dispensada" }
  | { causa: "ocorrencia_resolvida" }
  | { causa: "previsao_atualizada"; data: string }
  | { causa: "coleta_combinada" }
  | { causa: "contato_pos_venda" }
  | { causa: "pedido_encerrado" }
  | { causa: "cadencia_substituida"; toque: number };

/** Texto humano gravado em `desfecho_detalhe`. */
export function motivoEncerramento(m: MotivoEncerramento): string {
  switch (m.causa) {
    case "pedido_saiu":
      return `pedido saiu de ${stageLabel(m.stage)}`;
    case "pedido_entrou":
      return `pedido entrou em ${stageLabel(m.stage)}`;
    case "lead_encerrado":
      return `lead marcado como ${m.stage === "ganho" ? "Ganho" : "Perdido"}`;
    case "lead_avancou":
      return `lead avançou para ${m.stage}`;
    case "primeiro_contato":
      return "primeiro contato registrado";
    case "cliente_respondido":
      return "cliente respondido";
    case "contato_retomado":
      return "contato retomado pelo vendedor";
    case "entrega_comprovada":
      return "entrega comprovada";
    case "comprovacao_dispensada":
      return "comprovação de entrega dispensada";
    case "ocorrencia_resolvida":
      return "ocorrência resolvida";
    case "previsao_atualizada":
      return `previsão de entrega atualizada para ${m.data}`;
    case "coleta_combinada":
      return "coleta/entrega combinada com o cliente";
    case "contato_pos_venda":
      return "contato de pós-venda registrado";
    case "pedido_encerrado":
      return "pedido encerrado";
    case "cadencia_substituida":
      return `substituída pelo toque ${m.toque}`;
  }
}
