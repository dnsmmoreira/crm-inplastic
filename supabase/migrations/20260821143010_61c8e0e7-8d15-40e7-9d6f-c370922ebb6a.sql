-- ROLLBACK:
--   ALTER TABLE public.condicoes_pagamento DROP CONSTRAINT IF EXISTS condicoes_pagamento_parcelas_nao_vazio;
--   ALTER TABLE public.condicoes_pagamento DROP COLUMN IF EXISTS parcelas;
--   ALTER TABLE public.proposta_parcelas DROP COLUMN IF EXISTS percentual;
--   ALTER TABLE public.propostas ALTER COLUMN validity_days SET DEFAULT 15;
--   (as linhas fantasma apagadas não são recuperáveis)

-- 1) Nova coluna de parcelas (dias + percentual)
ALTER TABLE public.condicoes_pagamento ADD COLUMN IF NOT EXISTS parcelas jsonb;

-- 2) Backfill a partir de splits, dividindo igualmente com sobra na última parcela
WITH base AS (
  SELECT c.id,
         COALESCE(jsonb_array_length(c.splits), 0) AS n,
         c.splits
  FROM public.condicoes_pagamento c
  WHERE c.parcelas IS NULL
    AND jsonb_typeof(c.splits) = 'array'
    AND jsonb_array_length(c.splits) > 0
), calc AS (
  SELECT b.id,
         jsonb_agg(
           jsonb_build_object(
             'dias', (s.value)::int,
             'percentual',
             CASE WHEN s.ord = b.n
                  THEN 100 - (round(100.0 / b.n, 2) * (b.n - 1))
                  ELSE round(100.0 / b.n, 2)
             END
           )
           ORDER BY s.ord
         ) AS parcelas
  FROM base b
  CROSS JOIN LATERAL jsonb_array_elements_text(b.splits) WITH ORDINALITY AS s(value, ord)
  GROUP BY b.id, b.n
)
UPDATE public.condicoes_pagamento c
SET parcelas = calc.parcelas
FROM calc
WHERE c.id = calc.id;

-- 2b) Exceções explícitas (cadastro errado -> o que o nome promete)
UPDATE public.condicoes_pagamento
SET parcelas = '[{"dias":0,"percentual":50},{"dias":28,"percentual":50}]'::jsonb
WHERE id = 'pix-14';

UPDATE public.condicoes_pagamento
SET parcelas = '[{"dias":0,"percentual":25},{"dias":15,"percentual":25},{"dias":30,"percentual":25},{"dias":45,"percentual":25}]'::jsonb
WHERE id = 'pix-28';

-- 3) splits mantida e sincronizada com os dias das parcelas
UPDATE public.condicoes_pagamento c
SET splits = sub.dias
FROM (
  SELECT c2.id,
         COALESCE(jsonb_agg((p.value ->> 'dias')::int ORDER BY p.ord), '[]'::jsonb) AS dias
  FROM public.condicoes_pagamento c2
  CROSS JOIN LATERAL jsonb_array_elements(c2.parcelas) WITH ORDINALITY AS p(value, ord)
  WHERE jsonb_typeof(c2.parcelas) = 'array'
  GROUP BY c2.id
) sub
WHERE c.id = sub.id;

-- 4) Fallback para linhas sem splits utilizável: à vista 100%
UPDATE public.condicoes_pagamento
SET parcelas = '[{"dias":0,"percentual":100}]'::jsonb,
    splits = '[0]'::jsonb
WHERE parcelas IS NULL OR jsonb_typeof(parcelas) <> 'array' OR jsonb_array_length(parcelas) = 0;

-- 5) CHECK: parcelas é um array não vazio
ALTER TABLE public.condicoes_pagamento
  DROP CONSTRAINT IF EXISTS condicoes_pagamento_parcelas_nao_vazio;
ALTER TABLE public.condicoes_pagamento
  ADD CONSTRAINT condicoes_pagamento_parcelas_nao_vazio
  CHECK (
    parcelas IS NULL
    OR (jsonb_typeof(parcelas) = 'array' AND jsonb_array_length(parcelas) > 0)
  );

-- 6) Percentual por parcela na proposta
ALTER TABLE public.proposta_parcelas ADD COLUMN IF NOT EXISTS percentual numeric;

-- 7) Validade padrão de novas propostas: 10 dias
ALTER TABLE public.propostas ALTER COLUMN validity_days SET DEFAULT 10;

-- 8) Limpeza das linhas fantasma
DELETE FROM public.proposta_parcelas WHERE amount = 0 AND due_date IS NULL;