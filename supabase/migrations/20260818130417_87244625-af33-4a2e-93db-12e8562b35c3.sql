INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, k.chave
FROM public.perfis p
CROSS JOIN (VALUES ('pedidos.ver_todos'),('clientes.ver_todos'),('estoque.ver')) AS k(chave)
WHERE p.nome = 'Administrador'
  AND EXISTS (SELECT 1 FROM public.permissoes pm WHERE pm.chave = k.chave)
ON CONFLICT DO NOTHING;