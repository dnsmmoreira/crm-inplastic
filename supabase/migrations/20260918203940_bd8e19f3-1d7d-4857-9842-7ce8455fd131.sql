CREATE TABLE public.equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.equipes TO authenticated;
GRANT ALL ON public.equipes TO service_role;

ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipes select autenticado" ON public.equipes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipes insert gestao" ON public.equipes
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao(auth.uid(), 'usuarios.gerenciar'));

CREATE POLICY "equipes update gestao" ON public.equipes
  FOR UPDATE TO authenticated
  USING (public.tem_permissao(auth.uid(), 'usuarios.gerenciar'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'usuarios.gerenciar'));

CREATE TRIGGER trg_equipes_updated_at
  BEFORE UPDATE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN equipe_id uuid NULL REFERENCES public.equipes(id),
  ADD COLUMN supervisor_escopo text NOT NULL DEFAULT 'equipe';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_supervisor_escopo_chk
  CHECK (supervisor_escopo IN ('equipe','global'));

CREATE INDEX idx_profiles_equipe_id ON public.profiles(equipe_id);

-- null = null NAO casa: exige equipe_id definido nos dois lados.
CREATE OR REPLACE FUNCTION public.mesma_equipe(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pa
    JOIN public.profiles pb ON pb.id = _b
    WHERE pa.id = _a
      AND pa.equipe_id IS NOT NULL
      AND pa.equipe_id = pb.equipe_id
  )
$$;

REVOKE ALL ON FUNCTION public.mesma_equipe(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mesma_equipe(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisor_ve_tudo(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND supervisor_escopo = 'global'
  )
$$;

REVOKE ALL ON FUNCTION public.supervisor_ve_tudo(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_ve_tudo(uuid) TO authenticated;

-- Policies ADITIVAS de leitura. Nenhuma policy existente foi tocada.
CREATE POLICY "leads select ver_equipe" ON public.leads
  FOR SELECT TO authenticated USING (
    public.tem_permissao(auth.uid(), 'leads.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), owner_id))
  );

CREATE POLICY "clientes select ver_equipe" ON public.clientes
  FOR SELECT TO authenticated USING (
    public.tem_permissao(auth.uid(), 'clientes.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), vendedor_id))
  );

CREATE POLICY "propostas select ver_equipe" ON public.propostas
  FOR SELECT TO authenticated USING (
    public.tem_permissao(auth.uid(), 'propostas.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), owner_id))
  );

CREATE POLICY "pedidos select ver_equipe" ON public.pedidos
  FOR SELECT TO authenticated USING (
    public.tem_permissao(auth.uid(), 'pedidos.ver_equipe')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), owner_id))
  );