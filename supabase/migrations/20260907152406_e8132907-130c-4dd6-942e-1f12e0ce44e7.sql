ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS motivo_recusa text NULL,
  ADD COLUMN IF NOT EXISTS recusa_detalhe text NULL,
  ADD COLUMN IF NOT EXISTS recusada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS recusada_por uuid NULL,
  ADD COLUMN IF NOT EXISTS reaberta_em timestamptz NULL;

ALTER TABLE public.propostas
  DROP CONSTRAINT IF EXISTS propostas_motivo_recusa_check;

ALTER TABLE public.propostas
  ADD CONSTRAINT propostas_motivo_recusa_check CHECK (
    motivo_recusa IS NULL OR motivo_recusa IN (
      'Preço',
      'Concorrente',
      'Prazo de entrega',
      'Produto não atende',
      'Condições comerciais',
      'Sem resposta do cliente',
      'Sem aprovação interna',
      'Demanda cancelada ou adiada',
      'Duplicidade',
      'Lead inválido'
    )
  );

UPDATE public.propostas p
SET motivo_recusa = l.motivo_perda,
    recusa_detalhe = l.motivo_perda_detalhe,
    recusada_em = COALESCE(l.perdido_em, p.updated_at, p.created_at)
FROM public.leads l
WHERE p.lead_id = l.id
  AND p.status = 'recusada'
  AND p.motivo_recusa IS NULL
  AND l.motivo_perda IS NOT NULL;