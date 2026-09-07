ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprovacao_dispensada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comprovacao_dispensada_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comprovacao_dispensa_motivo text NULL;

CREATE INDEX IF NOT EXISTS pedidos_comprovacao_dispensada_em_idx
  ON public.pedidos (comprovacao_dispensada_em)
  WHERE comprovacao_dispensada_em IS NOT NULL;