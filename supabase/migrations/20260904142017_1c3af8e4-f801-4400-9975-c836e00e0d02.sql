ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS em_espera_desde timestamptz NULL,
  ADD COLUMN IF NOT EXISTS em_espera_por uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_em_espera
  ON public.whatsapp_conversas (em_espera_desde)
  WHERE em_espera_desde IS NOT NULL;