
CREATE OR REPLACE FUNCTION public.test_zapi_inbox_visibility(_uid uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count bigint;
BEGIN
  -- Impersona o role 'authenticated' e injeta o claim JWT para auth.uid()
  EXECUTE format('SET LOCAL ROLE authenticated');
  EXECUTE format('SET LOCAL "request.jwt.claims" = %L',
                 json_build_object('sub', _uid::text, 'role', 'authenticated')::text);
  SELECT count(*) INTO _count FROM public.zapi_inbox;
  RESET ROLE;
  RETURN _count;
END;
$$;

-- Só o service_role pode chamar (via psql/superuser também consegue).
REVOKE ALL ON FUNCTION public.test_zapi_inbox_visibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_zapi_inbox_visibility(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_zapi_inbox_visibility(uuid) TO service_role;
