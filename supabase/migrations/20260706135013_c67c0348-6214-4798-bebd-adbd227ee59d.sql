DROP POLICY IF EXISTS "authenticated mark processed" ON public.zapi_inbox;

CREATE POLICY "admins mark processed" ON public.zapi_inbox
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));