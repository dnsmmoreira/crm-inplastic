ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS desfecho text NULL,
  ADD COLUMN IF NOT EXISTS desfecho_detalhe text NULL,
  ADD COLUMN IF NOT EXISTS cobranca_n integer NOT NULL DEFAULT 1;

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_desfecho_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_desfecho_chk
  CHECK (desfecho IS NULL OR desfecho = ANY (ARRAY['retorno_agendado','avancou_etapa','perdido','sem_pendencia','manual']::text[]));

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk
  CHECK (tipo IS NULL OR tipo = ANY (ARRAY['follow_up','primeiro_contato','resposta_pendente','cadencia_proposta','retomar_contato','resgate_carteira','reativacao_lead','prospeccao','retorno_agendado','pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra','pos_venda_pedido','aprovacao_pendente','aguardando_pagamento','acompanhar_producao','pedido_travado','nf_atrasada','previsao_atrasada','ocorrencia_aberta','comprovacao_entrega','cadencia_analise_financeira','cadencia_aguardando_pagamento','cadencia_liberado','cadencia_producao','cadencia_coleta_entrega','cadencia_em_rota']::text[]));

CREATE INDEX IF NOT EXISTS tarefas_lead_tipo_concluida_idx
  ON public.tarefas (lead_id, tipo, concluida_at DESC);