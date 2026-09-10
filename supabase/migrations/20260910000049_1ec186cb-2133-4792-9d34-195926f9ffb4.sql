ALTER TABLE public.arena_participacao
  ADD COLUMN IF NOT EXISTS comissao_pct numeric(5,2) NULL,
  ADD COLUMN IF NOT EXISTS regiao text NULL;

ALTER TABLE public.arena_participacao
  DROP CONSTRAINT IF EXISTS arena_participacao_comissao_pct_check;

ALTER TABLE public.arena_participacao
  ADD CONSTRAINT arena_participacao_comissao_pct_check
  CHECK (comissao_pct IS NULL OR (comissao_pct >= 0 AND comissao_pct <= 100));

UPDATE public.arena_participacao ap
SET comissao_pct = (SELECT c.comissao_logiscal_pct FROM public.arena_config c WHERE c.id = 1)
WHERE ap.tipo_comercial = 'representante' AND ap.comissao_pct IS NULL;