ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS aprovacao_cliente_meio text NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_cliente_detalhe text NULL;