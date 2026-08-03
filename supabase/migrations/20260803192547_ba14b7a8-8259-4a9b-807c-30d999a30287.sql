ALTER TABLE public.xerife_config ADD COLUMN IF NOT EXISTS whatsapp_interno_ativo boolean NOT NULL DEFAULT false;
UPDATE public.xerife_config SET whatsapp_interno_ativo = false WHERE id = 1;