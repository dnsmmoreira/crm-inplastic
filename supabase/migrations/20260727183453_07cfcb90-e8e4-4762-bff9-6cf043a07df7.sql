-- Fase 3: histórico de transições de etapa do pedido (não destrutivo, aditivo)
CREATE TABLE IF NOT EXISTS public.pedido_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  from_stage public.pedido_stage,
  to_stage public.pedido_stage NOT NULL,
  is_backward boolean NOT NULL DEFAULT false,
  motivo text,
  moved_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedido_stage_history_pedido_id_idx
  ON public.pedido_stage_history(pedido_id, created_at DESC);

GRANT SELECT, INSERT ON public.pedido_stage_history TO authenticated;
GRANT ALL ON public.pedido_stage_history TO service_role;

ALTER TABLE public.pedido_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hist_select_authenticated"
  ON public.pedido_stage_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "hist_insert_authenticated"
  ON public.pedido_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (moved_by = auth.uid());

-- Sem policies de UPDATE/DELETE -> imutável para authenticated. service_role mantém acesso total via GRANT.
