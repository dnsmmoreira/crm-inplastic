INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo)
VALUES (
  'pedidos.aprovar_financeiro',
  'pedidos',
  'Responsável pela aprovação financeira',
  'Recebe os avisos e tarefas de aprovação financeira de pedidos',
  'booleana'
)
ON CONFLICT (chave) DO UPDATE
  SET grupo = EXCLUDED.grupo,
      rotulo = EXCLUDED.rotulo,
      descricao = EXCLUDED.descricao,
      tipo = EXCLUDED.tipo;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, 'pedidos.aprovar_financeiro'
FROM public.perfis p
WHERE p.nome = 'Financeiro'
ON CONFLICT DO NOTHING;