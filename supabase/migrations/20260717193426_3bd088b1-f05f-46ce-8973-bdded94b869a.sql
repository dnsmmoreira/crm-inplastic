REVOKE EXECUTE ON FUNCTION public.next_proposta_number(integer) FROM anon, PUBLIC;

CREATE POLICY "clientes_no_delete" ON public.clientes
  FOR DELETE TO authenticated USING (false);

CREATE POLICY "zapi_inbox_no_client_insert" ON public.zapi_inbox
  FOR INSERT TO authenticated, anon WITH CHECK (false);