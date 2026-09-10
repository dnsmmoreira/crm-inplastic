CREATE TABLE public.difal_aliquotas (
  uf text PRIMARY KEY,
  aliquota_interna numeric(5,2) NOT NULL,
  aliquota_interestadual numeric(5,2) NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.difal_aliquotas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.difal_aliquotas TO authenticated;
GRANT ALL ON public.difal_aliquotas TO service_role;

ALTER TABLE public.difal_aliquotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "difal_aliquotas_select_auth" ON public.difal_aliquotas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "difal_aliquotas_admin_write" ON public.difal_aliquotas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER difal_aliquotas_touch
  BEFORE UPDATE ON public.difal_aliquotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.difal_aliquotas (uf, aliquota_interna, aliquota_interestadual) VALUES
  ('AC',19.0,7.0),('AL',19.0,7.0),('AM',20.0,7.0),('AP',18.0,7.0),('BA',20.5,7.0),
  ('CE',20.0,7.0),('DF',20.0,7.0),('ES',17.0,7.0),('GO',19.0,7.0),('MA',23.0,7.0),
  ('MG',18.0,12.0),('MS',17.0,7.0),('MT',17.0,7.0),('PA',19.0,7.0),('PB',20.0,7.0),
  ('PE',20.5,7.0),('PI',22.5,7.0),('PR',19.5,12.0),('RJ',20.0,12.0),('RN',20.0,7.0),
  ('RO',19.5,7.0),('RR',20.0,7.0),('RS',17.0,12.0),('SC',17.0,12.0),('SE',19.0,7.0),
  ('SP',18.0,0.0),('TO',20.0,7.0);