
-- Fase D: proposta_itens aponta direto para produto Omie
ALTER TABLE public.proposta_itens
  ADD COLUMN IF NOT EXISTS omie_codigo_produto bigint;

CREATE INDEX IF NOT EXISTS idx_proposta_itens_omie_codigo_produto
  ON public.proposta_itens(omie_codigo_produto);

-- Backfill via mapa produtos.codigo_produto_omie (para itens antigos vinculados a produtos internos)
UPDATE public.proposta_itens pi
   SET omie_codigo_produto = p.codigo_produto_omie
  FROM public.produtos p
 WHERE pi.product_id = p.id
   AND pi.omie_codigo_produto IS NULL
   AND p.codigo_produto_omie IS NOT NULL;

COMMENT ON COLUMN public.proposta_itens.product_id IS
  'DEPRECATED — mantido para compatibilidade. Novos itens usam omie_codigo_produto.';
COMMENT ON COLUMN public.proposta_itens.omie_codigo_produto IS
  'Código do produto no Omie (fonte da verdade do catálogo comercial).';
