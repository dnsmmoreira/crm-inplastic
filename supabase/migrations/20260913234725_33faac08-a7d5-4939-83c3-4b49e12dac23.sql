-- Quem pode ver todas as propostas E tem permissão de editar propostas
-- passa a poder gravar cabeçalho, itens e parcelas de propostas de outros.
CREATE OR REPLACE FUNCTION public.pode_editar_proposta(_proposta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.propostas p
    WHERE p.id = _proposta_id
      AND (
        p.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          public.tem_permissao(auth.uid(), 'propostas.ver_todas')
          AND public.tem_permissao(auth.uid(), 'propostas.editar')
        )
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.pode_editar_proposta(uuid) TO authenticated;

DROP POLICY IF EXISTS "prop_itens via proposta" ON public.proposta_itens;
CREATE POLICY "prop_itens via proposta" ON public.proposta_itens FOR ALL TO authenticated
  USING (public.pode_editar_proposta(proposta_id))
  WITH CHECK (public.pode_editar_proposta(proposta_id));

DROP POLICY IF EXISTS "parcelas via proposta" ON public.proposta_parcelas;
CREATE POLICY "parcelas via proposta" ON public.proposta_parcelas FOR ALL TO authenticated
  USING (public.pode_editar_proposta(proposta_id))
  WITH CHECK (public.pode_editar_proposta(proposta_id));

DROP POLICY IF EXISTS "propostas owner update" ON public.propostas;
CREATE POLICY "propostas owner update" ON public.propostas FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.tem_permissao(auth.uid(), 'propostas.ver_todas')
      AND public.tem_permissao(auth.uid(), 'propostas.editar')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.tem_permissao(auth.uid(), 'propostas.ver_todas')
      AND public.tem_permissao(auth.uid(), 'propostas.editar')
    )
  );