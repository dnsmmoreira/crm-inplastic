-- ROLLBACK (definição atual, antes desta migration):
-- CREATE OR REPLACE FUNCTION public.tem_permissao(_user_id uuid, _chave text)
--  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $$
--   SELECT public.has_role(_user_id, 'admin') OR EXISTS (
--     SELECT 1 FROM public.user_perfis up
--     JOIN public.perfis p ON p.id = up.perfil_id AND p.ativo
--     JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
--     WHERE up.user_id = _user_id AND pp.permissao_chave = _chave
--   );
-- $$;

-- Rede de segurança: garante que o perfil Administrador contenha TODAS as chaves.
INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, pm.chave
FROM public.perfis p
CROSS JOIN public.permissoes pm
WHERE p.nome = 'Administrador'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.tem_permissao(_user_id uuid, _chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_perfis up
      JOIN public.perfis p ON p.id = up.perfil_id AND p.ativo
      WHERE up.user_id = _user_id
    )
    THEN EXISTS (
      SELECT 1 FROM public.user_perfis up
      JOIN public.perfis p ON p.id = up.perfil_id AND p.ativo
      JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
      WHERE up.user_id = _user_id AND pp.permissao_chave = _chave
    )
    ELSE public.has_role(_user_id, 'admin')
  END;
$$;