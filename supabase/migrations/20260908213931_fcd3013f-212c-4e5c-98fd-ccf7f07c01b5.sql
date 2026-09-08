ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS coleta_combinada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS coleta_combinada_por uuid NULL,
  ADD COLUMN IF NOT EXISTS pos_venda_contato_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS encerrado_motivo text NULL;

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk CHECK (
  tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','conversa_parada',
    'proposta_rascunho_parada','proposta_vencida','pos_venda_confirmacao','pos_venda_satisfacao',
    'pos_venda_recompra','pos_venda_pedido','aprovacao_pendente','aguardando_pagamento',
    'acompanhar_producao','pedido_travado','nf_atrasada','previsao_atrasada','ocorrencia_aberta',
    'comprovacao_entrega','cadencia_analise_financeira','cadencia_aguardando_pagamento',
    'cadencia_liberado','cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota',
    'combinar_coleta','pos_venda_atrasado'
  ]::text[])
);

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_desfecho_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_desfecho_chk CHECK (
  desfecho IS NULL OR desfecho = ANY (ARRAY[
    'retorno_agendado','avancou_etapa','perdido','sem_pendencia','em_espera','encerrar_conversa',
    'recusar_proposta','reemitir_proposta','prorrogar_proposta','excluir_rascunho',
    'data_combinada','manual','automatico'
  ]::text[])
);

ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS pos_venda_dias_uteis int NOT NULL DEFAULT 5;
