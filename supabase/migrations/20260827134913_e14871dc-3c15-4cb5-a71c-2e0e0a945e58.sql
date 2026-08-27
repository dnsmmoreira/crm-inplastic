CREATE POLICY "documentos anexos select autenticado"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-anexos');

CREATE POLICY "documentos anexos insert autenticado"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-anexos');

CREATE POLICY "documentos anexos update autenticado"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-anexos')
  WITH CHECK (bucket_id = 'documentos-anexos');