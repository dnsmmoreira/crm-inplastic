
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS simples_optante boolean,
  ADD COLUMN IF NOT EXISTS suframa_isento boolean,
  ADD COLUMN IF NOT EXISTS suframa_numero text;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS simples_optante boolean,
  ADD COLUMN IF NOT EXISTS suframa_isento boolean,
  ADD COLUMN IF NOT EXISTS suframa_numero text;
