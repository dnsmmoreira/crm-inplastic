
-- 1) Novo campo email_nf_xml em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_nf_xml text;

-- 2) Novo parâmetro em xerife_config: auto-atribuição de leads órfãos via round-robin
ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS auto_atribuir_lead_orfao boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sla_lead_orfao_min integer NOT NULL DEFAULT 15;
