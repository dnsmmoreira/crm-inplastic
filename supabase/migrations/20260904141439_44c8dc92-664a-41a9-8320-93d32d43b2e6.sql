ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;

ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk
  CHECK (tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato',
    'resgate_carteira','reativacao_lead','prospeccao',
    'pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra','pos_venda_pedido',
    'aprovacao_pendente','aguardando_pagamento','acompanhar_producao','pedido_travado',
    'nf_atrasada','previsao_atrasada','ocorrencia_aberta',
    'cadencia_analise_financeira','cadencia_aguardando_pagamento','cadencia_liberado',
    'cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota'
  ]::text[]));

UPDATE public.falhas_sistema
   SET resolvido_em = now()
 WHERE resolvido_em IS NULL
   AND origem IN ('xerife-pedidos.criarTarefa','xerife-engine.criarTarefa');