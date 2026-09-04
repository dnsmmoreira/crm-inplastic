ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS espera_alertada_em timestamptz NULL;