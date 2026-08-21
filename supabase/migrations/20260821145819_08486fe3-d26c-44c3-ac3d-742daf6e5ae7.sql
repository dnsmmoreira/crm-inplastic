-- 1) Backfill de `parcelas` a partir de `splits` (percentuais iguais, sobra na última).
UPDATE public.condicoes_pagamento c
SET parcelas = sub.parcelas
FROM (
  SELECT
    c2.id,
    jsonb_agg(
      jsonb_build_object(
        'dias', (d.value #>> '{}')::int,
        'percentual',
        CASE
          WHEN d.ord = cnt.n THEN round(100 - round(100.0 / cnt.n, 2) * (cnt.n - 1), 2)
          ELSE round(100.0 / cnt.n, 2)
        END
      )
      ORDER BY d.ord
    ) AS parcelas
  FROM public.condicoes_pagamento c2
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n FROM jsonb_array_elements(c2.splits)
  ) cnt
  CROSS JOIN LATERAL (
    SELECT value, ordinality AS ord
    FROM jsonb_array_elements(c2.splits) WITH ORDINALITY AS t(value, ordinality)
  ) d
  WHERE c2.parcelas IS NULL
    AND jsonb_typeof(c2.splits) = 'array'
    AND jsonb_array_length(c2.splits) > 0
  GROUP BY c2.id
) sub
WHERE c.id = sub.id;

-- 2) Residuais sem splits utilizáveis: à vista 100%.
UPDATE public.condicoes_pagamento
SET parcelas = '[{"dias": 0, "percentual": 100}]'::jsonb
WHERE parcelas IS NULL;

-- 3) A coluna passa a ser obrigatória.
ALTER TABLE public.condicoes_pagamento
  ALTER COLUMN parcelas SET DEFAULT '[]'::jsonb,
  ALTER COLUMN parcelas SET NOT NULL;

-- 4) Limpeza das parcelas fantasma em propostas sem previsão de faturamento.
DELETE FROM public.proposta_parcelas pp
USING public.propostas p
WHERE p.id = pp.proposta_id
  AND p.previsao_faturamento IS NULL
  AND pp.amount = 0
  AND pp.due_date IS NULL;