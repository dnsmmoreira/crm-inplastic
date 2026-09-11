ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS proposta_id uuid REFERENCES public.propostas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notificacoes_proposta_id_idx ON public.notificacoes(proposta_id);