ALTER TYPE public.conversa_status ADD VALUE IF NOT EXISTS 'aguardando_humano';
ALTER TABLE public.whatsapp_conversas ADD COLUMN IF NOT EXISTS handoff_alertado_em timestamptz;
ALTER TABLE public.whatsapp_conversas ADD COLUMN IF NOT EXISTS handoff_realertado_em timestamptz;