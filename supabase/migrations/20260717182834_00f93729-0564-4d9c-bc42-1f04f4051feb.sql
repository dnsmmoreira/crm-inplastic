ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS numero_pedido_cliente text,
  ADD COLUMN IF NOT EXISTS observacoes_pedido text;