DROP POLICY IF EXISTS "mensagens select via conversa" ON public.whatsapp_mensagens;
CREATE POLICY "mensagens select via conversa" ON public.whatsapp_mensagens
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.whatsapp_conversas c
  WHERE c.id = whatsapp_mensagens.conversa_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR c.atribuido_para = auth.uid()
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id AND l.owner_id = auth.uid())
    )
));

DROP POLICY IF EXISTS "mensagens insert via conversa" ON public.whatsapp_mensagens;
CREATE POLICY "mensagens insert via conversa" ON public.whatsapp_mensagens
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.whatsapp_conversas c
  WHERE c.id = whatsapp_mensagens.conversa_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR c.atribuido_para = auth.uid()
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id AND l.owner_id = auth.uid())
    )
));