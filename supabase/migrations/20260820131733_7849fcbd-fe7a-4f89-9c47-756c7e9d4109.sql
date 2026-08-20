-- ROLLBACK:
-- DELETE FROM public.perfil_permissoes WHERE perfil_id = (SELECT id FROM public.perfis WHERE nome = 'Gestor Comercial');
-- DELETE FROM public.perfis WHERE nome = 'Gestor Comercial';
-- DELETE FROM public.perfil_permissoes WHERE permissao_chave = 'licitacoes.gerenciar';
-- DELETE FROM public.permissoes WHERE chave = 'licitacoes.gerenciar';

INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo)
VALUES ('licitacoes.gerenciar', 'licitacoes', 'Gerenciar licitações', 'Acessa e gerencia o módulo de licitações', 'booleana')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.perfis (nome, descricao, papel, base_role, ativo)
VALUES ('Gestor Comercial', 'Gestão de representantes e vendas por licitação', 'Administrador', 'admin'::app_role, true)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, k.chave
FROM public.perfis p
CROSS JOIN (VALUES
  ('clientes.ver_todos'),
  ('pedidos.ver_todos'),
  ('pedidos.exportar'),
  ('pedidos.movimentar'),
  ('propostas.ver_todas'),
  ('relatorios.ver'),
  ('relatorios.exportar'),
  ('estoque.ver'),
  ('whatsapp.atender'),
  ('whatsapp.assumir_conversa'),
  ('whatsapp.devolver_ia'),
  ('licitacoes.gerenciar')
) AS k(chave)
WHERE p.nome = 'Gestor Comercial'
  AND EXISTS (SELECT 1 FROM public.permissoes pm WHERE pm.chave = k.chave)
ON CONFLICT DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, 'licitacoes.gerenciar'
FROM public.perfis p
WHERE p.nome = 'Administrador'
ON CONFLICT DO NOTHING;