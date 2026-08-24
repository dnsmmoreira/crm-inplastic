ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS motivo_perda text,
  ADD COLUMN IF NOT EXISTS motivo_perda_detalhe text,
  ADD COLUMN IF NOT EXISTS perdido_em timestamptz,
  ADD COLUMN IF NOT EXISTS recontatar_em date,
  ADD COLUMN IF NOT EXISTS reatribuido_abandono_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_motivo_perda ON public.leads (motivo_perda) WHERE motivo_perda IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_recontatar_em ON public.leads (recontatar_em) WHERE recontatar_em IS NOT NULL;

ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS cadencia_abandono_dias integer[] NOT NULL DEFAULT '{2,5,10}',
  ADD COLUMN IF NOT EXISTS reatribuir_lead_abandonado boolean NOT NULL DEFAULT true;