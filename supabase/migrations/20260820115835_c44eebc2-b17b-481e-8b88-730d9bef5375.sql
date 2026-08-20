-- ROLLBACK:
-- DROP TABLE IF EXISTS public.cargos;
-- UPDATE public.perfis SET nome = 'Operacional Comercial' WHERE nome = 'Operacional';
-- ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_papel_check;
-- ALTER TABLE public.perfis DROP COLUMN IF EXISTS papel;

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS papel text;

UPDATE public.perfis SET papel = 'Administrador' WHERE nome = 'Administrador';
UPDATE public.perfis SET papel = 'Vendas' WHERE nome = 'Vendedor';
UPDATE public.perfis SET papel = 'Operacional' WHERE nome IN ('Financeiro', 'Operacional Comercial', 'Operacional');
UPDATE public.perfis SET papel = CASE WHEN base_role = 'admin' THEN 'Administrador' ELSE 'Vendas' END WHERE papel IS NULL;

UPDATE public.perfis SET nome = 'Operacional' WHERE nome = 'Operacional Comercial';

ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_papel_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_papel_check CHECK (papel IN ('Vendas','Operacional','Administrador'));
ALTER TABLE public.perfis ALTER COLUMN papel SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.cargos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cargos_select_authenticated" ON public.cargos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cargos_insert_admin" ON public.cargos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "cargos_update_admin" ON public.cargos
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "cargos_delete_admin" ON public.cargos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.cargos (nome, ordem) VALUES
  ('Assistente Comercial', 1),
  ('Assistente Financeiro', 2),
  ('Vendedor', 3),
  ('Diretor Comercial', 4),
  ('Diretor Administrativo', 5),
  ('Representante', 6)
ON CONFLICT (nome) DO NOTHING;