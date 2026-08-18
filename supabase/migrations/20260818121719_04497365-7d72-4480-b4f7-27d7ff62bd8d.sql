-- 1. TABELAS
CREATE TABLE public.perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  descricao text,
  base_role public.app_role NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia perfis" ON public.perfis FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Autenticado le perfis" ON public.perfis FOR SELECT TO authenticated USING (true);

CREATE TABLE public.permissoes (
  chave text PRIMARY KEY,
  grupo text NOT NULL,
  rotulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'booleana' CHECK (tipo IN ('booleana','numerica'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissoes TO authenticated;
GRANT ALL ON public.permissoes TO service_role;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia permissoes catalogo" ON public.permissoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Autenticado le permissoes catalogo" ON public.permissoes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.perfil_permissoes (
  perfil_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  permissao_chave text NOT NULL REFERENCES public.permissoes(chave),
  valor_numerico numeric NULL,
  PRIMARY KEY (perfil_id, permissao_chave)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfil_permissoes TO authenticated;
GRANT ALL ON public.perfil_permissoes TO service_role;
ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia perfil_permissoes" ON public.perfil_permissoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Autenticado le perfil_permissoes" ON public.perfil_permissoes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.user_perfis (
  user_id uuid NOT NULL,
  perfil_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, perfil_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_perfis TO authenticated;
GRANT ALL ON public.user_perfis TO service_role;
ALTER TABLE public.user_perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia user_perfis" ON public.user_perfis FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Usuario le proprios perfis" ON public.user_perfis FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. FUNCOES
CREATE OR REPLACE FUNCTION public.tem_permissao(_user_id uuid, _chave text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.user_perfis up
    JOIN public.perfis p ON p.id = up.perfil_id AND p.ativo
    JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
    WHERE up.user_id = _user_id AND pp.permissao_chave = _chave
  );
$$;
REVOKE EXECUTE ON FUNCTION public.tem_permissao(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tem_permissao(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.valor_permissao(_user_id uuid, _chave text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(pp.valor_numerico) FROM public.user_perfis up
  JOIN public.perfis p ON p.id = up.perfil_id AND p.ativo
  JOIN public.perfil_permissoes pp ON pp.perfil_id = p.id
  WHERE up.user_id = _user_id AND pp.permissao_chave = _chave;
$$;
REVOKE EXECUTE ON FUNCTION public.valor_permissao(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.valor_permissao(uuid, text) TO authenticated, service_role;

-- 3. SEED CATALOGO
INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo) VALUES
  ('leads.excluir','leads','Excluir leads','Excluir leads definitivamente','booleana'),
  ('leads.fila.gerenciar','leads','Gerenciar fila','Configurar a fila de distribuição de leads','booleana'),
  ('propostas.editar','propostas','Editar propostas','Criar e editar propostas','booleana'),
  ('propostas.excluir','propostas','Excluir propostas','Excluir propostas','booleana'),
  ('propostas.alterar_status','propostas','Alterar status','Aprovar/liberar edição de propostas','booleana'),
  ('propostas.ver_todas','propostas','Ver todas as propostas','Ver propostas de todos os vendedores','booleana'),
  ('pedidos.exportar','pedidos','Exportar pedidos','Exportar dados de pedidos','booleana'),
  ('relatorios.ver','relatorios','Ver relatórios','Acessar a área de relatórios','booleana'),
  ('relatorios.exportar','relatorios','Exportar relatórios','Exportar relatórios em CSV','booleana'),
  ('whatsapp.atender','whatsapp','Atender WhatsApp','Responder conversas no chat','booleana'),
  ('whatsapp.assumir_conversa','whatsapp','Assumir conversa','Assumir o atendimento de uma conversa','booleana'),
  ('whatsapp.devolver_ia','whatsapp','Devolver para a IA','Devolver o atendimento para a IA','booleana'),
  ('xerife.configurar','xerife','Configurar Xerife','Alterar regras e cadências do Xerife','booleana'),
  ('agente_ia.editar_prompt','agente_ia','Editar prompt da IA','Alterar o prompt do agente de IA','booleana'),
  ('canais.configurar','canais','Configurar canais','Configurar integrações de canais','booleana'),
  ('usuarios.gerenciar','usuarios','Gerenciar usuários','Criar, editar e desativar usuários','booleana'),
  ('metas.definir','metas','Definir metas','Definir metas mensais dos vendedores','booleana'),
  ('precos.limite_desconto','precos','Limite de desconto','Percentual máximo de desconto permitido','numerica');

-- 4. SEED PERFIS
INSERT INTO public.perfis (nome, descricao, base_role) VALUES
  ('Administrador','Acesso completo ao CRM','admin'),
  ('Vendedor','Acesso padrão de vendedor (equivalente ao comportamento atual)','vendedor');

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, pe.chave FROM public.perfis p CROSS JOIN public.permissoes pe WHERE p.nome = 'Administrador';

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, c.chave FROM public.perfis p
CROSS JOIN (VALUES
  ('propostas.editar'),('relatorios.ver'),
  ('whatsapp.atender'),('whatsapp.assumir_conversa'),('whatsapp.devolver_ia')
) AS c(chave)
WHERE p.nome = 'Vendedor';

-- 5. BACKFILL
INSERT INTO public.user_perfis (user_id, perfil_id)
SELECT ur.user_id, p.id FROM public.user_roles ur
JOIN public.perfis p ON p.nome = CASE WHEN ur.role = 'admin' THEN 'Administrador' ELSE 'Vendedor' END
ON CONFLICT DO NOTHING;