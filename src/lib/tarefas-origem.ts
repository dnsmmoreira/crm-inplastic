/**
 * Origens aceitas por `tarefas.origem` — precisa bater EXATAMENTE com o CHECK
 * `tarefas_origem_chk` no banco. Texto livre aqui vira insert recusado em
 * silêncio (foi o bug de 24/09 na recusa de proposta).
 */
export const ORIGENS_TAREFA = ["manual", "xerife", "pedido_fluxo", "proposta_fluxo"] as const;
export type OrigemTarefa = (typeof ORIGENS_TAREFA)[number];

/** Origem da tarefa de retomar contato criada ao recusar uma proposta. */
export const ORIGEM_TAREFA_RECUSA_PROPOSTA: OrigemTarefa = "proposta_fluxo";
