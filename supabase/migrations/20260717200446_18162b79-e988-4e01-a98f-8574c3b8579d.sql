-- Restringir SELECT das tabelas de fila
DROP POLICY IF EXISTS "fila_estado read" ON public.fila_estado;
REVOKE SELECT ON public.fila_estado FROM authenticated;

DROP POLICY IF EXISTS "fila read authenticated" ON public.fila_vendedores;
CREATE POLICY "fila read admin"
  ON public.fila_vendedores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));