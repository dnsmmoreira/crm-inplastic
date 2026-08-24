-- Campo INTERNO de tratativa comercial na proposta.
-- Nunca é impresso na proposta enviada ao cliente (diferente de observations / observacoes_pedido).
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS tratativa_comercial text;

COMMENT ON COLUMN public.propostas.tratativa_comercial IS
  'Interno: o que foi negociado com o cliente. Nunca renderizado na impressão da proposta.';

-- Rollback:
-- ALTER TABLE public.propostas DROP COLUMN IF EXISTS tratativa_comercial;