INSERT INTO public.permissoes (chave, grupo, rotulo, descricao)
VALUES (
  'pedidos.operar_producao',
  'Pedidos',
  'Operar produção/coleta/entrega',
  'Quem executa de fato produção, coleta e entrega — usada para notificar pedido liberado e para dono da tarefa de acompanhar produção. NÃO é a mesma coisa que pedidos.movimentar (que é sobre QUEM PODE mover o pedido de etapa, mais ampla).'
)
ON CONFLICT (chave) DO UPDATE SET grupo = EXCLUDED.grupo, rotulo = EXCLUDED.rotulo, descricao = EXCLUDED.descricao;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, 'pedidos.operar_producao' FROM public.perfis p WHERE p.nome = 'Operacional'
ON CONFLICT DO NOTHING;