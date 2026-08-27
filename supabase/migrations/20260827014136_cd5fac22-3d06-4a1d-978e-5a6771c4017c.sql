CREATE TABLE public.transportadoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transportadoras TO authenticated;
GRANT ALL ON public.transportadoras TO service_role;

ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transportadoras read authenticated"
  ON public.transportadoras FOR SELECT TO authenticated USING (true);

CREATE POLICY "transportadoras admin write"
  ON public.transportadoras FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER transportadoras_updated_at
  BEFORE UPDATE ON public.transportadoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
