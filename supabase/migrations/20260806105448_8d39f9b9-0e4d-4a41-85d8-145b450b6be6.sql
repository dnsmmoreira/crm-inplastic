DROP POLICY IF EXISTS lead_owner_history_select ON public.lead_owner_history;
CREATE POLICY lead_owner_history_select ON public.lead_owner_history
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_owner_history.lead_id AND l.owner_id = auth.uid())
);

DROP POLICY IF EXISTS lead_stage_history_select ON public.lead_stage_history;
CREATE POLICY lead_stage_history_select ON public.lead_stage_history
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_stage_history.lead_id AND l.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "authenticated read produtos_omie" ON public.produtos_omie;
CREATE POLICY "authenticated read produtos_omie" ON public.produtos_omie
FOR SELECT TO authenticated USING (true);
CREATE POLICY produtos_omie_admin_insert ON public.produtos_omie
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY produtos_omie_admin_update ON public.produtos_omie
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY produtos_omie_admin_delete ON public.produtos_omie
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE EXECUTE ON FUNCTION public.tg_conversa_atribuida_notifica() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_pedido_item_baixa_estoque() FROM PUBLIC, anon, authenticated;