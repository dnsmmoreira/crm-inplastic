ALTER TABLE public.condicoes_pagamento
  ADD COLUMN IF NOT EXISTS max_parcelas integer NULL,
  ADD COLUMN IF NOT EXISTS juros_compostos boolean NOT NULL DEFAULT false;

ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS acrescimo_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cartao_parcelas integer NULL;

INSERT INTO public.condicoes_pagamento
  (id, label, method, active, permite_pf, acrescimo_percent, max_parcelas, juros_compostos, parcelas, ordem, splits)
VALUES
  ('cartao-credito', 'Cartão de crédito', 'Cartão', true, true, 3, 12, true,
   '[{"dias":0,"percentual":100}]'::jsonb, 1, '[0]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  method = EXCLUDED.method,
  active = true,
  permite_pf = true,
  acrescimo_percent = EXCLUDED.acrescimo_percent,
  max_parcelas = EXCLUDED.max_parcelas,
  juros_compostos = EXCLUDED.juros_compostos,
  parcelas = EXCLUDED.parcelas,
  ordem = EXCLUDED.ordem;