CREATE TABLE public.consulta_tentativas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.consulta_tentativas TO service_role;

ALTER TABLE public.consulta_tentativas ENABLE ROW LEVEL SECURITY;

CREATE INDEX consulta_tentativas_chave_idx ON public.consulta_tentativas (chave, criado_em DESC);

COMMENT ON TABLE public.consulta_tentativas IS 'Tentativas para limite de taxa distribuido (consulta de dono, recuperacao de senha). Apenas service role.';

CREATE OR REPLACE FUNCTION public.registrar_tentativa(_chave text, _janela_segundos integer, _limite integer)
RETURNS TABLE(permitido boolean, usadas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _usadas integer;
BEGIN
  DELETE FROM public.consulta_tentativas WHERE criado_em < now() - interval '1 day';

  SELECT count(*) INTO _usadas
    FROM public.consulta_tentativas
   WHERE chave = _chave
     AND criado_em > now() - make_interval(secs => _janela_segundos);

  IF _usadas >= _limite THEN
    RETURN QUERY SELECT false, _usadas;
    RETURN;
  END IF;

  INSERT INTO public.consulta_tentativas (chave) VALUES (_chave);
  RETURN QUERY SELECT true, _usadas + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_tentativa(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa(text, integer, integer) TO service_role;