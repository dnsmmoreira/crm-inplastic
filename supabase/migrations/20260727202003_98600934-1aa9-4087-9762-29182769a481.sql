
CREATE TABLE IF NOT EXISTS public.pedido_fiscal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pedido_fiscal_history TO authenticated;
GRANT ALL ON public.pedido_fiscal_history TO service_role;

ALTER TABLE public.pedido_fiscal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_history_select_auth"
  ON public.pedido_fiscal_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fiscal_history_insert_auth"
  ON public.pedido_fiscal_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pedido_fiscal_history_pedido_id_idx
  ON public.pedido_fiscal_history(pedido_id, alterado_em DESC);
