alter table public.tarefas drop constraint if exists tarefas_tipo_chk;
alter table public.tarefas add constraint tarefas_tipo_chk check (
  tipo is null or tipo = any (array[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','conversa_parada',
    'proposta_rascunho_parada','proposta_vencida','pos_venda_confirmacao','pos_venda_satisfacao',
    'pos_venda_recompra','pos_venda_pedido','aprovacao_pendente','aguardando_pagamento',
    'acompanhar_producao','pedido_travado','nf_atrasada','previsao_atrasada','ocorrencia_aberta',
    'comprovacao_entrega','cadencia_analise_financeira','cadencia_aguardando_pagamento',
    'cadencia_liberado','cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota',
    'combinar_coleta','pos_venda_atrasado','transferir_carteira',
    'prazo_a_vencer','cadencia_entrega','cadencia_em_transito'
  ])
);