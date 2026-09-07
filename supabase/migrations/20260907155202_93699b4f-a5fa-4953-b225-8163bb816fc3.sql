ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS familia text NULL;

COMMENT ON COLUMN public.produtos.familia IS 'Família/modelo do produto (SKU sem o sufixo de cor). O lead aponta para a família; a cor é escolhida na proposta.';

UPDATE public.produtos
SET familia = CASE
  WHEN upper(btrim(sku)) = 'EXLS 1210' THEN 'EXLS'
  ELSE regexp_replace(
         regexp_replace(upper(btrim(sku)), '\s+(AZL|BRC|CNZ|NAT|NTR|PRT|AMR|LRJ|VRD|VER|VRM|RSA)$', ''),
         '\s+(AZL|BRC|CNZ|NAT|NTR|PRT|AMR|LRJ|VRD|VER|VRM|RSA)$', '')
END
WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS produtos_familia_idx ON public.produtos (familia);