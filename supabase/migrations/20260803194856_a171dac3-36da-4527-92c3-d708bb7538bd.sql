ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS midia jsonb NULL;

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS requer_humano boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_handoff text NULL;