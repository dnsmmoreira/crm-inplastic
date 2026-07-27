CREATE UNIQUE INDEX IF NOT EXISTS pedidos_proposta_id_unique
  ON public.pedidos (proposta_id)
  WHERE proposta_id IS NOT NULL;