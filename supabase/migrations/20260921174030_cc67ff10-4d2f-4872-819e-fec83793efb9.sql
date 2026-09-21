CREATE OR REPLACE FUNCTION public.equipe_listar_colegas()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM public.profiles p
  WHERE p.ativo = true
    AND p.deleted_at IS NULL
    AND (
      public.supervisor_ve_tudo(auth.uid())
      OR public.mesma_equipe(auth.uid(), p.id)
    )
  ORDER BY p.name
$$;

REVOKE ALL ON FUNCTION public.equipe_listar_colegas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipe_listar_colegas() FROM anon;
GRANT EXECUTE ON FUNCTION public.equipe_listar_colegas() TO authenticated;