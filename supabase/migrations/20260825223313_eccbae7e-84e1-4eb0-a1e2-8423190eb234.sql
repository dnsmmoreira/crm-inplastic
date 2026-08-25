-- Registro formal do DROP já aplicado manualmente (idempotente)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- whatsapp_optout: telefones de clientes
DROP POLICY IF EXISTS "optout_select_auth" ON public.whatsapp_optout;
DROP POLICY IF EXISTS "whatsapp_optout_select_auth" ON public.whatsapp_optout;
DROP POLICY IF EXISTS "Authenticated can read optout" ON public.whatsapp_optout;
CREATE POLICY "optout_select_restrito"
  ON public.whatsapp_optout FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.tem_permissao(auth.uid(), 'canais.configurar'));

-- zapi_envios: telefones de clientes no log de envio
DROP POLICY IF EXISTS "zapi_envios_select_auth" ON public.zapi_envios;
DROP POLICY IF EXISTS "envios_select_auth" ON public.zapi_envios;
DROP POLICY IF EXISTS "Authenticated can read zapi_envios" ON public.zapi_envios;
CREATE POLICY "zapi_envios_select_restrito"
  ON public.zapi_envios FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.tem_permissao(auth.uid(), 'canais.configurar'));

-- produtos_omie: contém valor_unitario (custo)
DROP POLICY IF EXISTS "produtos_omie_select_auth" ON public.produtos_omie;
DROP POLICY IF EXISTS "Authenticated can read produtos_omie" ON public.produtos_omie;
DROP POLICY IF EXISTS "produtos_omie_select" ON public.produtos_omie;
CREATE POLICY "produtos_omie_select_restrito"
  ON public.produtos_omie FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));