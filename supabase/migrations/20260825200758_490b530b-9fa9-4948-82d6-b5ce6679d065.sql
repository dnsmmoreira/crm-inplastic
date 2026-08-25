CREATE POLICY "whatsapp anexos upload autenticado"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-anexos');

CREATE POLICY "whatsapp anexos leitura publica"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'whatsapp-anexos');