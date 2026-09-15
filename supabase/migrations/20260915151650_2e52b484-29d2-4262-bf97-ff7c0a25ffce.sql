ALTER TABLE public.emitters ADD COLUMN IF NOT EXISTS horario_coleta text;

UPDATE public.emitters
SET horario_coleta = 'Segunda a Quinta: 08h00 às 11h30 e 13h30 às 17h30 · Sexta: 08h00 às 11h30 e 13h30 às 16h30'
WHERE horario_coleta IS NULL;