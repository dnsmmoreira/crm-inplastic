insert into public.permissoes (chave, rotulo, grupo, tipo, descricao)
values ('propostas.criar_para_outros','Criar proposta em nome de outro','propostas','booleana','Pode escolher em nome de qual vendedor/representante a proposta será criada')
on conflict (chave) do nothing;

alter table public.propostas add column if not exists criado_por uuid null;
comment on column public.propostas.criado_por is 'Quem clicou em criar. Difere de owner_id quando a proposta foi criada em nome de outra pessoa.';

drop policy if exists "propostas owner insert" on public.propostas;
create policy "propostas owner insert" on public.propostas
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.tem_permissao(auth.uid(), 'propostas.criar_para_outros')
  );

insert into public.perfil_permissoes (perfil_id, permissao_chave)
select pf.id, k.chave
from public.perfis pf
cross join (values ('propostas.criar_para_outros'), ('propostas.editar')) as k(chave)
where pf.nome in ('Diretoria', 'Gestor Comercial')
on conflict do nothing;