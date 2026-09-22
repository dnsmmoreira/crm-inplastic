REVOKE EXECUTE ON FUNCTION public.registrar_tentativa(text, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_tentativa(text, integer, integer) FROM anon, authenticated;
REVOKE ALL ON TABLE public.consulta_tentativas FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa(text, integer, integer) TO service_role;
GRANT ALL ON TABLE public.consulta_tentativas TO service_role;