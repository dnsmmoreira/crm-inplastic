ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS conferencia_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferencia_confirmada_por_user_id uuid;