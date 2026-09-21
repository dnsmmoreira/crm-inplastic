DROP POLICY IF EXISTS "whatsapp anexos leitura autenticada" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp anexos upload autenticado" ON storage.objects;

CREATE POLICY "whatsapp anexos leitura por conversa"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-anexos' AND (
      public.has_role(auth.uid(), 'admin') OR
      EXISTS (
        SELECT 1 FROM public.whatsapp_conversas c
        WHERE c.id::text = split_part(storage.objects.name, '/', 1)
           OR (split_part(storage.objects.name, '/', 1) = 'inbound'
               AND c.phone = split_part(storage.objects.name, '/', 2))
      )
    )
  );

CREATE POLICY "whatsapp anexos upload por conversa"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-anexos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.whatsapp_pode_atuar(split_part(name, '/', 1)::uuid)
  );