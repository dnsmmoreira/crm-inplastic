ALTER TABLE public.propostas DROP CONSTRAINT IF EXISTS propostas_forma_pagamento_check;
ALTER TABLE public.propostas ADD CONSTRAINT propostas_forma_pagamento_check
  CHECK (forma_pagamento IS NULL OR forma_pagamento = ANY (ARRAY['Boleto'::text, 'Depósito em Conta'::text, 'PIX'::text, 'Cartão'::text]));