ALTER TABLE public.mensagem_templates
  ADD COLUMN IF NOT EXISTS meta_nome text,
  ADD COLUMN IF NOT EXISTS meta_id text,
  ADD COLUMN IF NOT EXISTS meta_status text,
  ADD COLUMN IF NOT EXISTS meta_categoria text,
  ADD COLUMN IF NOT EXISTS meta_mapa jsonb,
  ADD COLUMN IF NOT EXISTS meta_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS meta_erro text,
  ADD COLUMN IF NOT EXISTS meta_sugerido boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS mensagem_templates_meta_nome_key
  ON public.mensagem_templates (meta_nome) WHERE meta_nome IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mensagem_templates_titulo_key
  ON public.mensagem_templates (titulo);

ALTER TABLE public.mensagem_templates
  DROP CONSTRAINT IF EXISTS mensagem_templates_meta_status_check;
ALTER TABLE public.mensagem_templates
  ADD CONSTRAINT mensagem_templates_meta_status_check
  CHECK (meta_status IS NULL OR meta_status IN ('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','ERRO'));

ALTER TABLE public.mensagem_templates
  DROP CONSTRAINT IF EXISTS mensagem_templates_meta_categoria_check;
ALTER TABLE public.mensagem_templates
  ADD CONSTRAINT mensagem_templates_meta_categoria_check
  CHECK (meta_categoria IS NULL OR meta_categoria IN ('MARKETING','UTILITY'));