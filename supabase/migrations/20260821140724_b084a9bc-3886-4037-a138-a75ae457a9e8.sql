-- ROLLBACK: DROP FUNCTION IF EXISTS public.cnpj_status(text, uuid);
CREATE OR REPLACE FUNCTION public.cnpj_status(_cnpj text, _vendedor_id uuid)
RETURNS TABLE(existe boolean, ativo boolean, mesmo_vendedor boolean, cliente_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text := regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g');
  _row record;
BEGIN
  IF length(_digits) <> 14 THEN
    RETURN QUERY SELECT false, false, false, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id, c.ativo, c.vendedor_id
    INTO _row
    FROM public.clientes c
   WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = _digits
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    coalesce(_row.ativo, true),
    (_row.vendedor_id = _vendedor_id OR public.has_role(auth.uid(), 'admin')),
    _row.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cnpj_status(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cnpj_status(text, uuid) TO service_role;