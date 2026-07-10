REVOKE EXECUTE ON FUNCTION public.placar_vendedores(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.placar_vendedores(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.snapshot_metas_mes(integer, integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.snapshot_metas_mes(integer, integer) TO service_role;