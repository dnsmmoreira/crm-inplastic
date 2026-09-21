INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, 'relatorios.ver'
FROM public.perfis p
WHERE p.nome = 'Supervisor ADM'
ON CONFLICT DO NOTHING;