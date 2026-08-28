ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS condicao_pagamento_padrao_id text REFERENCES public.condicoes_pagamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_nf text,
  ADD COLUMN IF NOT EXISTS regras_faturamento text,
  ADD COLUMN IF NOT EXISTS aceite_desconto_duplicata boolean NOT NULL DEFAULT false;