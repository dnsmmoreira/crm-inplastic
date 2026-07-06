-- Revoga EXECUTE de PUBLIC/authenticated e mantém só para service_role
REVOKE ALL ON FUNCTION public.atribuir_proximo_vendedor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atribuir_proximo_vendedor(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.atribuir_proximo_vendedor(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_proximo_vendedor(uuid) TO service_role;
