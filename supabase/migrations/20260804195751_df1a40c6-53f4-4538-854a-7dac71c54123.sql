ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS watchdog_conversa_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watchdog_conversa_ia_min integer NOT NULL DEFAULT 15;