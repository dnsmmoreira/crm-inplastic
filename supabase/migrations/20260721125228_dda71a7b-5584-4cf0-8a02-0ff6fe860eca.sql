
-- Add banking / PIX fields to emitters
ALTER TABLE public.emitters
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS pix text;

-- Sanitize brand + legal name + fiscal data + banking for the 3 emitters.
-- Set INPLASTIC as the new default.
UPDATE public.emitters SET is_default = false;

UPDATE public.emitters
   SET brand = 'TAOPLAST',
       tagline = 'Comércio de produtos plásticos',
       legal_name = 'TAOPLAST COMERCIO DE PLASTICOS LTDA',
       cnpj = '42.608.358/0001-41',
       banco = 'Banco do Brasil',
       agencia = '0386-7',
       conta = '91587-4',
       pix = '42608358000141'
 WHERE id = 'taoplast';

UPDATE public.emitters
   SET brand = 'INPLASTIC',
       tagline = 'Comércio de produtos plásticos',
       legal_name = 'INPLASTIC COMERCIO DE PLASTICOS LTDA',
       cnpj = '19.959.992/0001-07',
       banco = 'Banco do Brasil',
       agencia = '0386-7',
       conta = '87075-7',
       pix = '19959992000107',
       is_default = true
 WHERE id = 'inplastic';

UPDATE public.emitters
   SET brand = 'LICITAPLAS',
       tagline = 'Comércio de plásticos',
       legal_name = 'LICITAPLAS COMERCIO DE PLASTICOS',
       cnpj = '39.871.995/0001-00',
       banco = 'Banco do Brasil',
       agencia = '0386-7',
       conta = '91828-8',
       pix = '39871995000100'
 WHERE id = 'licitaplas';
