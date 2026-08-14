CREATE TABLE public.condicoes_comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  dias integer[] NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.condicoes_comerciais TO authenticated;
GRANT ALL ON public.condicoes_comerciais TO service_role;

ALTER TABLE public.condicoes_comerciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condicoes_comerciais_select_auth"
  ON public.condicoes_comerciais FOR SELECT TO authenticated USING (true);

CREATE POLICY "condicoes_comerciais_insert_admin"
  ON public.condicoes_comerciais FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "condicoes_comerciais_update_admin"
  ON public.condicoes_comerciais FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "condicoes_comerciais_delete_admin"
  ON public.condicoes_comerciais FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS condicao_comercial_id uuid REFERENCES public.condicoes_comerciais(id),
  ADD COLUMN IF NOT EXISTS previsao_faturamento date;

ALTER TABLE public.proposta_parcelas
  ADD COLUMN IF NOT EXISTS due_date date;