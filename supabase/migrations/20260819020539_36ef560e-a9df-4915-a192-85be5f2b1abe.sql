INSERT INTO public.permissoes (chave, grupo, rotulo, descricao) VALUES
  ('pedidos.movimentar', 'pedidos', 'Movimentar pedidos', 'Movimentar pedidos entre etapas do funil operacional'),
  ('pedidos.excluir', 'pedidos', 'Excluir pedidos', 'Excluir pedidos definitivamente'),
  ('empresas.editar', 'empresas', 'Editar empresas', 'Criar e editar empresas do grupo (emitentes)')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, k.chave
FROM public.perfis p
JOIN (VALUES
  ('Administrador', 'pedidos.movimentar'),
  ('Financeiro', 'pedidos.movimentar'),
  ('Operacional Comercial', 'pedidos.movimentar'),
  ('Administrador', 'pedidos.excluir'),
  ('Administrador', 'empresas.editar'),
  ('Operacional Comercial', 'empresas.editar')
) AS k(perfil, chave) ON k.perfil = p.nome
ON CONFLICT DO NOTHING;

CREATE POLICY "conversas select atendentes" ON public.whatsapp_conversas
  FOR SELECT TO authenticated
  USING (public.tem_permissao(auth.uid(), 'whatsapp.atender'));

CREATE POLICY "mensagens select atendentes" ON public.whatsapp_mensagens
  FOR SELECT TO authenticated
  USING (public.tem_permissao(auth.uid(), 'whatsapp.atender'));

CREATE POLICY "emitters write empresas_editar" ON public.emitters
  FOR ALL TO authenticated
  USING (public.tem_permissao(auth.uid(), 'empresas.editar'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'empresas.editar'));

CREATE POLICY "pedidos delete pedidos_excluir" ON public.pedidos
  FOR DELETE TO authenticated
  USING (public.tem_permissao(auth.uid(), 'pedidos.excluir'));

CREATE POLICY "propostas owner delete" ON public.propostas
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());