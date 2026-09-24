ALTER TABLE public.condicoes_pagamento ADD COLUMN IF NOT EXISTS cartao_taxas_operadora jsonb NULL;
COMMENT ON COLUMN public.condicoes_pagamento.cartao_taxas_operadora IS 'Taxa retida pela operadora por nº de parcelas, ex.: {"1":4.98,"2":9.64}. Fator = 1/(1-taxa/100). Parcela fora da tabela não é oferecida.';
UPDATE public.condicoes_pagamento
   SET cartao_taxas_operadora = '{"1":4.98,"2":9.64,"3":11.23,"4":11.36,"5":14.31,"6":14.32,"7":16.72,"8":16.72,"9":19.69,"10":20.65}'::jsonb,
       max_parcelas = 10
 WHERE id = 'cartao-credito';