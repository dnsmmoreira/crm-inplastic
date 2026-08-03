CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_mensagens_external_id_uidx
  ON public.whatsapp_mensagens (external_id)
  WHERE external_id IS NOT NULL
    AND created_at >= TIMESTAMPTZ '2026-08-03 00:00:00+00';