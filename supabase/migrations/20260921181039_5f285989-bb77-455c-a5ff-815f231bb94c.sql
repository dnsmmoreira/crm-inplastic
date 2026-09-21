
CREATE OR REPLACE FUNCTION public.whatsapp_anexo_visivel(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN true
    ELSE coalesce((
      SELECT (
           c.atribuido_para = auth.uid()
        OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id AND l.owner_id = auth.uid())
        OR public.whatsapp_conversa_visivel(
             c.atribuido_para,
             (SELECT l.owner_id FROM public.leads l WHERE l.id = c.lead_id))
        OR public.whatsapp_conversa_visivel_auditor(
             c.atribuido_para,
             (SELECT l.owner_id FROM public.leads l WHERE l.id = c.lead_id))
      )
      FROM public.whatsapp_conversas c
      WHERE (
              split_part(_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND c.id = (split_part(_name, '/', 1))::uuid
            )
         OR (
              split_part(_name, '/', 1) = 'inbound'
              AND c.phone = split_part(_name, '/', 2)
            )
      LIMIT 1
    ), false)
  END
$$;

REVOKE ALL ON FUNCTION public.whatsapp_anexo_visivel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_anexo_visivel(text) TO authenticated;

DROP POLICY IF EXISTS "whatsapp anexos leitura por conversa" ON storage.objects;
CREATE POLICY "whatsapp anexos leitura por conversa"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-anexos' AND public.whatsapp_anexo_visivel(name));
