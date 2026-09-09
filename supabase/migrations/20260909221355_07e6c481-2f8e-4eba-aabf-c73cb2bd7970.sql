REVOKE ALL ON FUNCTION public.localizar_carteira(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transferir_cliente(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tel_chave(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.localizar_carteira(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_cliente(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tel_chave(text) TO authenticated, service_role;