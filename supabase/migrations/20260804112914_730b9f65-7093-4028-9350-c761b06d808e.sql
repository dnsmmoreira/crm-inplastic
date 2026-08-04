ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_vinculo_codigo text;

ALTER TABLE public.xerife_config ADD COLUMN IF NOT EXISTS telegram_ativo boolean NOT NULL DEFAULT false;

UPDATE public.xerife_config SET telegram_ativo = false WHERE id = 1 AND telegram_ativo IS DISTINCT FROM false;