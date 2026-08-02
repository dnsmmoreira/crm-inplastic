DO $$
BEGIN
  IF EXISTS (SELECT posicao FROM public.fila_vendedores GROUP BY posicao HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Existem posicoes duplicadas em fila_vendedores; migration abortada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.fila_vendedores'::regclass
       AND conname = 'fila_vendedores_posicao_key'
  ) THEN
    ALTER TABLE public.fila_vendedores ADD CONSTRAINT fila_vendedores_posicao_key UNIQUE (posicao);
  END IF;
END $$;