ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_pessoa text NOT NULL DEFAULT 'PJ',
  ADD COLUMN IF NOT EXISTS cpf text;

ALTER TABLE public.clientes ALTER COLUMN cnpj DROP NOT NULL;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tipo_pessoa_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_tipo_pessoa_check CHECK (tipo_pessoa IN ('PJ','PF'));

CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_unique ON public.clientes (cpf) WHERE cpf IS NOT NULL;

ALTER TABLE public.condicoes_pagamento
  ADD COLUMN IF NOT EXISTS permite_pf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acrescimo_percent numeric NOT NULL DEFAULT 0;

UPDATE public.condicoes_pagamento
   SET permite_pf = true
 WHERE method = 'Cartão'
    OR splits::text IN ('[0]', '[0.0]');

UPDATE public.condicoes_pagamento SET acrescimo_percent = 2 WHERE id = 'boleto-30';
UPDATE public.condicoes_pagamento SET acrescimo_percent = 3.5 WHERE id = 'boleto-2x-30-60';
UPDATE public.condicoes_pagamento SET acrescimo_percent = 5 WHERE id = 'boleto-3x-30-60-90';
UPDATE public.condicoes_pagamento SET acrescimo_percent = 3 WHERE id = 'cartao-avista';
UPDATE public.condicoes_pagamento SET acrescimo_percent = 6 WHERE id = 'cartao-3x';
UPDATE public.condicoes_pagamento SET acrescimo_percent = 9 WHERE id = 'cartao-6x';