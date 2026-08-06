ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS watchdog_conversa_fria_min integer NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS public.n8n_reenvio_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  max_tentativas integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pendente',
  ultimo_erro text,
  proxima_tentativa_em timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.n8n_reenvio_fila TO authenticated;
GRANT ALL ON public.n8n_reenvio_fila TO service_role;

ALTER TABLE public.n8n_reenvio_fila ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver a fila de reenvio"
  ON public.n8n_reenvio_fila FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS n8n_reenvio_fila_pendentes_idx
  ON public.n8n_reenvio_fila (status, proxima_tentativa_em);

CREATE TRIGGER n8n_reenvio_fila_updated_at
  BEFORE UPDATE ON public.n8n_reenvio_fila
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();