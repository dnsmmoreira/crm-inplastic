DROP POLICY IF EXISTS "ocorrencias_update_auth" ON public.pedido_ocorrencias;

CREATE POLICY "ocorrencias_update_auth" ON public.pedido_ocorrencias
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND (criada_por = auth.uid() OR resolvida_por = auth.uid() OR resolvida = false))
  WITH CHECK (auth.uid() IS NOT NULL);