ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_origem_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_origem_chk
  CHECK (origem = ANY (ARRAY['manual'::text, 'xerife'::text, 'pedido_fluxo'::text]));

ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_tipo_chk;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_tipo_chk
  CHECK (tipo IS NULL OR tipo = ANY (ARRAY[
    'follow_up'::text,
    'primeiro_contato'::text,
    'resposta_pendente'::text,
    'cadencia_proposta'::text,
    'pos_venda_confirmacao'::text,
    'pos_venda_satisfacao'::text,
    'pos_venda_recompra'::text,
    'resgate_carteira'::text,
    'reativacao_lead'::text,
    'prospeccao'::text,
    'aprovacao_pendente'::text,
    'aguardando_pagamento'::text,
    'acompanhar_producao'::text,
    'pos_venda_pedido'::text
  ]));