REVOKE EXECUTE ON FUNCTION public.pode_ver_documento(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pode_editar_documento(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_documento(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_editar_documento(text, uuid) TO authenticated, service_role;