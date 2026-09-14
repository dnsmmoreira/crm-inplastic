CREATE OR REPLACE FUNCTION public.chat_listar_colegas()
RETURNS TABLE(id uuid, name text, avatar_color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.avatar_color
  FROM public.profiles p
  WHERE p.ativo = true
    AND p.deleted_at IS NULL
  ORDER BY p.name
$$;

REVOKE ALL ON FUNCTION public.chat_listar_colegas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_listar_colegas() FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_listar_colegas() TO authenticated;