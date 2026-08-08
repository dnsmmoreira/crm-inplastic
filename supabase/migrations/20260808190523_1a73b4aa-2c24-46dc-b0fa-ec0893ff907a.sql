CREATE TABLE public.zapi_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL,
  tipo text NOT NULL,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zapi_alertas TO authenticated;
GRANT ALL ON public.zapi_alertas TO service_role;

ALTER TABLE public.zapi_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem alertas zapi"
  ON public.zapi_alertas FOR SELECT TO authenticated USING (true);

CREATE INDEX zapi_alertas_canal_created_idx ON public.zapi_alertas (canal, created_at DESC);
CREATE INDEX zapi_alertas_created_idx ON public.zapi_alertas (created_at DESC);