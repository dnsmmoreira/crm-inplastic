CREATE TABLE public.zapi_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL,
  phone text NOT NULL,
  ctx text,
  mensagem_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zapi_envios TO authenticated;
GRANT ALL ON public.zapi_envios TO service_role;
ALTER TABLE public.zapi_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zapi_envios_select_auth" ON public.zapi_envios FOR SELECT TO authenticated USING (true);

CREATE INDEX zapi_envios_phone_created_idx ON public.zapi_envios (phone, created_at DESC);
CREATE INDEX zapi_envios_canal_created_idx ON public.zapi_envios (canal, created_at DESC);

CREATE TABLE public.whatsapp_optout (
  phone text PRIMARY KEY,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_optout TO authenticated;
GRANT ALL ON public.whatsapp_optout TO service_role;
ALTER TABLE public.whatsapp_optout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_optout_select_auth" ON public.whatsapp_optout FOR SELECT TO authenticated USING (true);