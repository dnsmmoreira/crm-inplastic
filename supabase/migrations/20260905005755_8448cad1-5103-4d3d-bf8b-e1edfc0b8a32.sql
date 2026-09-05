ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_categoria_check;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_categoria_check
  CHECK (categoria = ANY (ARRAY['contrato_social'::text, 'balanco'::text, 'cartao_cnpj'::text, 'margem_compra'::text, 'outro'::text, 'foto_entrega'::text, 'canhoto_nf'::text, 'comprovante_entrega'::text]));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entrega_observacao text NULL,
  ADD COLUMN IF NOT EXISTS entrega_confirmada_por uuid NULL,
  ADD COLUMN IF NOT EXISTS entrega_comprovada_em timestamptz NULL;

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk
  CHECK (tipo IS NULL OR tipo = ANY (ARRAY['follow_up', 'primeiro_contato', 'resposta_pendente', 'cadencia_proposta', 'retomar_contato', 'resgate_carteira', 'reativacao_lead', 'prospeccao', 'pos_venda_confirmacao', 'pos_venda_satisfacao', 'pos_venda_recompra', 'pos_venda_pedido', 'aprovacao_pendente', 'aguardando_pagamento', 'acompanhar_producao', 'pedido_travado', 'nf_atrasada', 'previsao_atrasada', 'ocorrencia_aberta', 'comprovacao_entrega', 'cadencia_analise_financeira', 'cadencia_aguardando_pagamento', 'cadencia_liberado', 'cadencia_producao', 'cadencia_coleta_entrega', 'cadencia_em_rota']::text[]));