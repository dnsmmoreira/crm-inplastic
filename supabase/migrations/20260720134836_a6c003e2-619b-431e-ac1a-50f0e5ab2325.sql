
CREATE OR REPLACE FUNCTION public.cnpj_status(_cnpj text)
RETURNS TABLE(existe boolean, ativo boolean, mesmo_vendedor boolean, cliente_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
BEGIN
  _digits := regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g');
  IF length(_digits) <> 14 THEN
    RETURN QUERY SELECT false, false, false, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id, c.ativo, c.vendedor_id
    INTO _row
    FROM public.clientes c
   WHERE regexp_replace(c.cnpj, '\D', '', 'g') = _digits
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    coalesce(_row.ativo, false),
    (_row.vendedor_id = auth.uid()),
    _row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cnpj_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cnpj_status(text) TO authenticated;
