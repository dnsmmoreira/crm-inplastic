/**
 * Fonte única dos tipos de tarefa aceitos pelo sistema.
 *
 * Esta lista é a mesma usada:
 *  - pelo CHECK `tarefas_tipo_chk` no banco (migration gerada a partir daqui);
 *  - pelos rótulos da UI (`TAREFA_TIPO_LABEL`);
 *  - pelo teste que garante que todo tipo emitido pelo Xerife existe aqui.
 *
 * Módulo puro: sem imports de servidor, banco ou React.
 */

export const TAREFA_TIPOS = [
  // Comercial / leads
  "follow_up",
  "primeiro_contato",
  "resposta_pendente",
  "cadencia_proposta",
  "retomar_contato",
  "resgate_carteira",
  "reativacao_lead",
  "prospeccao",
  // Pós-venda
  "pos_venda_confirmacao",
  "pos_venda_satisfacao",
  "pos_venda_recompra",
  "pos_venda_pedido",
  // Pedidos
  "aprovacao_pendente",
  "aguardando_pagamento",
  "acompanhar_producao",
  "pedido_travado",
  "nf_atrasada",
  "previsao_atrasada",
  "ocorrencia_aberta",
  "comprovacao_entrega",
  // Cadência por etapa do pedido (src/lib/pedidos-cadencia.ts)
  "cadencia_analise_financeira",
  "cadencia_aguardando_pagamento",
  "cadencia_liberado",
  "cadencia_producao",
  "cadencia_coleta_entrega",
  "cadencia_em_rota",
] as const;

export type TarefaTipo = (typeof TAREFA_TIPOS)[number];

export function isTarefaTipoValido(tipo: string | null | undefined): boolean {
  return !!tipo && (TAREFA_TIPOS as readonly string[]).includes(tipo);
}

/** Rótulo humano por tipo — usado na agenda e nas listas de tarefas. */
export const TAREFA_TIPO_LABEL: Record<TarefaTipo, string> = {
  follow_up: "Follow-up",
  primeiro_contato: "1º Contato",
  resposta_pendente: "Responder",
  cadencia_proposta: "Cadência",
  retomar_contato: "Retomar contato",
  resgate_carteira: "Resgate carteira",
  reativacao_lead: "Reativação",
  prospeccao: "Prospecção",
  pos_venda_confirmacao: "Pós-venda: confirmar",
  pos_venda_satisfacao: "Pós-venda: satisfação",
  pos_venda_recompra: "Pós-venda: recompra",
  pos_venda_pedido: "Pós-venda",
  aprovacao_pendente: "Liberar pedido",
  aguardando_pagamento: "Confirmar pagamento",
  acompanhar_producao: "Acompanhar produção",
  pedido_travado: "Pedido parado",
  nf_atrasada: "NF atrasada",
  previsao_atrasada: "Entrega atrasada",
  ocorrencia_aberta: "Ocorrência aberta",
  comprovacao_entrega: "Comprovar entrega",
  cadencia_analise_financeira: "Cadência: análise financeira",
  cadencia_aguardando_pagamento: "Cadência: aguardando pagamento",
  cadencia_liberado: "Cadência: liberado",
  cadencia_producao: "Cadência: produção",
  cadencia_coleta_entrega: "Cadência: coleta/entrega",
  cadencia_em_rota: "Cadência: em rota",
};

export function rotuloTipoTarefa(tipo: string | null | undefined): string {
  if (!tipo) return "tarefa";
  return TAREFA_TIPO_LABEL[tipo as TarefaTipo] ?? tipo;
}

/** SQL do CHECK — fonte única para a migration. */
export function sqlCheckTarefasTipo(): string {
  const lista = TAREFA_TIPOS.map((t) => `'${t}'`).join(", ");
  return `CHECK (tipo IS NULL OR tipo = ANY (ARRAY[${lista}]::text[]))`;
}
