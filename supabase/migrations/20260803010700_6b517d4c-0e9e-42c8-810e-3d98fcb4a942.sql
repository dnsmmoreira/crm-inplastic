-- 1) Colunas novas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_cache text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limite_leads_simultaneos integer,
  ADD COLUMN IF NOT EXISTS canais_entrada text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_reset_exigido boolean NOT NULL DEFAULT false;

-- 2) Permissões por usuário
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ver_todos_leads boolean NOT NULL DEFAULT false,
  editar_propostas boolean NOT NULL DEFAULT true,
  excluir_propostas boolean NOT NULL DEFAULT false,
  exportar_dados boolean NOT NULL DEFAULT false,
  ver_relatorios boolean NOT NULL DEFAULT false,
  gerenciar_usuarios boolean NOT NULL DEFAULT false,
  configurar_integracoes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve proprias permissoes" ON public.user_permissions;
CREATE POLICY "Usuario ve proprias permissoes"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin gerencia permissoes" ON public.user_permissions;
CREATE POLICY "Admin gerencia permissoes"
  ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS user_permissions_updated_at ON public.user_permissions;
CREATE TRIGGER user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Auditoria de usuários (imutável)
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alvo_user_id uuid NOT NULL,
  ator_user_id uuid,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_audit_log_alvo_idx
  ON public.user_audit_log (alvo_user_id, criado_em DESC);

GRANT SELECT ON public.user_audit_log TO authenticated;
GRANT ALL ON public.user_audit_log TO service_role;

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin le auditoria de usuarios" ON public.user_audit_log;
CREATE POLICY "Admin le auditoria de usuarios"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Contagem de admins ativos
CREATE OR REPLACE FUNCTION public.admins_ativos_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'::app_role
    AND p.ativo = true
    AND p.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.admins_ativos_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admins_ativos_count() TO authenticated, service_role;

-- 5) Backfill de permissões conforme papel atual
INSERT INTO public.user_permissions (
  user_id, ver_todos_leads, editar_propostas, excluir_propostas,
  exportar_dados, ver_relatorios, gerenciar_usuarios, configurar_integracoes
)
SELECT
  p.id,
  public.has_role(p.id, 'admin'),
  true,
  public.has_role(p.id, 'admin'),
  public.has_role(p.id, 'admin'),
  true,
  public.has_role(p.id, 'admin'),
  public.has_role(p.id, 'admin')
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;