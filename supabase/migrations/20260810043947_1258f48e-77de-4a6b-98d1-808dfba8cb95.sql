CREATE TABLE public.wa_cloud_eventos (
  id bigserial PRIMARY KEY,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  tipo text,
  wa_message_id text UNIQUE,
  phone text,
  payload jsonb,
  processado boolean NOT NULL DEFAULT false,
  erro text
);

GRANT SELECT ON public.wa_cloud_eventos TO authenticated;
GRANT ALL ON public.wa_cloud_eventos TO service_role;

ALTER TABLE public.wa_cloud_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver eventos wa cloud" ON public.wa_cloud_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_wa_cloud_eventos_recebido_em ON public.wa_cloud_eventos (recebido_em DESC);
CREATE INDEX idx_wa_cloud_eventos_phone ON public.wa_cloud_eventos (phone);