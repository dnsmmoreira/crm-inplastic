-- 1a: permissão granular de leads
INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo)
VALUES ('leads.ver_todos', 'leads', 'Ver todos os leads', 'Visualiza os leads de todos os vendedores', 'booleana')
ON CONFLICT (chave) DO NOTHING;

-- 1b: policy de visão ampla em leads, no padrão das outras tabelas
DROP POLICY IF EXISTS "leads select ver_todos" ON public.leads;
CREATE POLICY "leads select ver_todos" ON public.leads
  FOR SELECT TO authenticated
  USING (tem_permissao(auth.uid(), 'leads.ver_todos'));

-- 1c: backfill explícito do acesso que hoje é implícito
INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, c.chave
FROM public.perfis p
CROSS JOIN (VALUES ('leads.ver_todos'), ('propostas.ver_todas')) AS c(chave)
WHERE p.nome IN ('Administrador', 'Gestor Comercial')
ON CONFLICT DO NOTHING;

-- 1d: remover o bypass has_role(admin) das quatro policies de SELECT-dono
DROP POLICY "leads owner select" ON public.leads;
CREATE POLICY "leads owner select" ON public.leads
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY "clientes_select_dono_ou_admin" ON public.clientes;
CREATE POLICY "clientes_select_dono_ou_admin" ON public.clientes
  FOR SELECT TO authenticated USING (vendedor_id = auth.uid());

DROP POLICY "pedidos owner select" ON public.pedidos;
CREATE POLICY "pedidos owner select" ON public.pedidos
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY "propostas owner select" ON public.propostas;
CREATE POLICY "propostas owner select" ON public.propostas
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- 2: perfil protegido vira dado
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS protegido boolean NOT NULL DEFAULT false;
UPDATE public.perfis SET protegido = true WHERE nome IN ('Administrador', 'Vendedor');

-- 5: tabela morta
DROP TABLE IF EXISTS public.user_permissions;