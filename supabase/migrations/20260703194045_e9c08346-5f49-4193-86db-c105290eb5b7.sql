
-- Trigger util
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================================
-- user_workspaces: dados operacionais isolados por vendedor
-- Guarda leads, tarefas, propostas e configurações do agente do usuário
-- em um JSON. O vendedor só enxerga o próprio; o admin enxerga todos.
-- =====================================================================
CREATE TABLE public.user_workspaces (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspaces TO authenticated;
GRANT ALL ON public.user_workspaces TO service_role;

ALTER TABLE public.user_workspaces ENABLE ROW LEVEL SECURITY;

-- Vendedor: gerencia o próprio workspace
CREATE POLICY "user selects own workspace"
  ON public.user_workspaces FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user inserts own workspace"
  ON public.user_workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user updates own workspace"
  ON public.user_workspaces FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin: enxerga tudo e pode editar qualquer workspace
CREATE POLICY "admin selects all workspaces"
  ON public.user_workspaces FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin inserts any workspace"
  ON public.user_workspaces FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin updates any workspace"
  ON public.user_workspaces FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin deletes any workspace"
  ON public.user_workspaces FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_workspaces_set_updated_at
  BEFORE UPDATE ON public.user_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- system_workspace: cadastros globais compartilhados
-- Guarda produtos, condições comerciais e empresas do grupo (CNPJs).
-- Todo autenticado lê; só admin escreve.
-- =====================================================================
CREATE TABLE public.system_workspace (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.system_workspace TO authenticated;
GRANT ALL ON public.system_workspace TO service_role;

ALTER TABLE public.system_workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated reads system workspace"
  ON public.system_workspace FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin inserts system workspace"
  ON public.system_workspace FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin updates system workspace"
  ON public.system_workspace FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER system_workspace_set_updated_at
  BEFORE UPDATE ON public.system_workspace
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cria a linha única do sistema (vazia; será populada no primeiro carregamento pelo admin)
INSERT INTO public.system_workspace (id, data)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
