ALTER TABLE public.proposta_itens ADD COLUMN IF NOT EXISTS ncm text;

UPDATE public.proposta_itens pi
SET ncm = p.ncm
FROM public.produtos p, public.propostas pr
WHERE pi.product_id = p.id
  AND pi.proposta_id = pr.id
  AND pr.status = 'rascunho'
  AND pi.ncm IS NULL
  AND p.ncm IS NOT NULL;