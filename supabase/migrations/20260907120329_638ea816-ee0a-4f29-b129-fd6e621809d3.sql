ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS meta_template_automatico text NULL,
  ADD COLUMN IF NOT EXISTS meta_template_automatico_lang text NOT NULL DEFAULT 'pt_BR';

COMMENT ON COLUMN public.xerife_config.meta_template_automatico IS 'Nome do template aprovado na Meta usado nos envios automaticos fora da janela de 24h. Null = usa META_TEMPLATE_NAME ou o padrao do codigo.';
COMMENT ON COLUMN public.xerife_config.meta_template_automatico_lang IS 'Idioma do template automatico (padrao pt_BR).';

UPDATE public.xerife_config SET meta_template_automatico = 'crm_retomada_de_contato' WHERE id = 1;