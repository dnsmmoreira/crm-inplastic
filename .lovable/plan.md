# Coerência do sistema de acesso (cargo / perfil / permissão / equipe)

Cinco frentes independentes. Nada de relatórios, Placar/Arena, `profiles.cargo` x `cargo_id` ou simplificação de `perfis.papel` nesta rodada.

## Correção de uma premissa do escopo

Conferi no banco antes de planejar: **`propostas.ver_todas` JÁ está concedida** a "Administrador" e a "Gestor Comercial" (assim como `clientes.ver_todos` e `pedidos.ver_todos`). O que falta mesmo é só `leads.ver_todos` — essa permissão nem existe ainda, e hoje leads é o único caso em que a visão ampla vem 100% do atalho de administrador. O backfill do item 1c fica, portanto, menor do que o descrito, e inclui `propostas.ver_todas` apenas como garantia idempotente.

Estado hoje (verificado):

| Perfil | base_role | ver_* concedidas |
| --- | --- | --- |
| Administrador | admin | clientes.ver_todos, pedidos.ver_todos, propostas.ver_todas |
| Gestor Comercial | admin | clientes.ver_todos, pedidos.ver_todos, propostas.ver_todas |
| Operacional | vendedor | clientes.ver_todos, pedidos.ver_todos, propostas.ver_todas |
| Financeiro | vendedor | pedidos.ver_todos, propostas.ver_todas |
| Supervisor ADM | vendedor | os quatro `*.ver_equipe` |
| Vendedor | vendedor | nenhuma |

Quem tem papel de administrador no sistema: Denis e Wagner (perfil Administrador) e Kelly (Gestor Comercial). São exatamente os três que hoje dependem do atalho para enxergar leads de terceiros — e os três recebem `leads.ver_todos` no backfill, então ninguém perde visão.

## 1. Permissão granular como única fonte de verdade

a) Nova permissão `leads.ver_todos`, grupo `leads`, no padrão das outras.
b) Nova policy de SELECT em `leads`.
c) Backfill em `perfil_permissoes` para Administrador e Gestor Comercial.
d) Remoção do `OR has_role(...,'admin')` das quatro policies de SELECT-dono.

Não encosta em nenhuma outra policy: DELETE e telas administrativas continuam exigindo administrador de verdade, e só as tabelas leads/clientes/pedidos/propostas entram.

## 2. "Perfil protegido" vira dado

Coluna `perfis.protegido boolean not null default false`, marcada `true` para "Administrador" e "Vendedor". `listPerfis`, `savePerfil`, `deletePerfil` e `setPerfilPermissoes` passam a ler a coluna; a constante `PERFIS_PROTEGIDOS` sai do código. Renomear um perfil deixa de destravar a proteção.

## 3. Perfil obrigatório na criação do usuário

O formulário de cadastro passa a exigir a escolha de um perfil (lista dos perfis ativos), e o campo "Papel" some do formulário — ele passa a ser derivado do perfil escolhido, como já acontece na edição. Depois do convite criado, o vínculo é gravado reaproveitando a lógica existente de `setPerfilDoUsuario`, nunca duplicando-a. Se o vínculo falhar, o erro aparece na tela com o convite já enviado identificado, para não deixar conta órfã em silêncio.

## 4. Aba "Equipe" vira "Usuários"

Só o rótulo da aba de lista/CRUD de usuários. A aba "Equipes" e a tabela `equipes` ficam intocadas.

## 5. Tabela morta

`public.user_permissions` é removida. Ela tem 11 linhas residuais e nenhuma policy, função ou código a lê — as linhas vão embora junto, sem impacto.

---

## Detalhes técnicos

### 1a/1b — permissão e policy de leads

```sql
insert into public.permissoes (chave, grupo, rotulo, descricao, tipo)
values ('leads.ver_todos', 'leads', 'Ver todos os leads',
        'Enxergar leads de todos os vendedores da empresa.', 'booleana')
on conflict (chave) do nothing;

create policy "leads select ver_todos" on public.leads
  for select to authenticated
  using (tem_permissao(auth.uid(), 'leads.ver_todos'));
```

### 1c — concessões (exatamente estas)

| Perfil | Permissão | Situação |
| --- | --- | --- |
| Administrador | `leads.ver_todos` | nova |
| Administrador | `propostas.ver_todas` | já existe (insert idempotente) |
| Gestor Comercial | `leads.ver_todos` | nova |
| Gestor Comercial | `propostas.ver_todas` | já existe (insert idempotente) |

```sql
insert into public.perfil_permissoes (perfil_id, permissao_chave)
select p.id, c.chave
from public.perfis p
cross join (values ('leads.ver_todos'), ('propostas.ver_todas')) as c(chave)
where p.nome in ('Administrador', 'Gestor Comercial')
on conflict do nothing;
```

### 1d — policies de SELECT-dono, texto final

```sql
drop policy "leads owner select" on public.leads;
create policy "leads owner select" on public.leads
  for select to authenticated using (owner_id = auth.uid());

drop policy "clientes_select_dono_ou_admin" on public.clientes;
create policy "clientes_select_dono_ou_admin" on public.clientes
  for select to authenticated using (vendedor_id = auth.uid());

drop policy "pedidos owner select" on public.pedidos;
create policy "pedidos owner select" on public.pedidos
  for select to authenticated using (owner_id = auth.uid());

drop policy "propostas owner select" on public.propostas;
create policy "propostas owner select" on public.propostas
  for select to authenticated using (owner_id = auth.uid());
```

As policies `* select ver_todos` / `ver_todas` / `ver_equipe` já existentes continuam iguais e passam a ser o único caminho de visão ampla.

### 2 — coluna e código

```sql
alter table public.perfis add column protegido boolean not null default false;
update public.perfis set protegido = true where nome in ('Administrador', 'Vendedor');
```

`src/lib/perfis.functions.ts`: `listPerfis` devolve `protegido: p.protegido`; `savePerfil`/`deletePerfil`/`setPerfilPermissoes` carregam a coluna e barram pelo dado. Remoção do export `PERFIS_PROTEGIDOS` após conferir que nenhum outro arquivo o usa.

### 3 — createUser

`createUserSchema` ganha `perfilId: z.string().uuid()` obrigatório e perde `role` (derivado do `base_role` do perfil). Após `inviteUserByEmail`, o handler chama o helper compartilhado extraído de `setPerfilDoUsuario` (grava `user_perfis` + sincroniza `user_roles`), de modo que o servidor continue sendo a única autoridade. `CreateUserCard` em `src/routes/usuarios.tsx` troca o `<select>` de papel por um de perfis ativos, obrigatório.

### 5 — drop

```sql
drop table public.user_permissions;
```

### Verificação após implementar

- Suíte, typecheck e build.
- Simulação por usuário (sem alterar dados) confirmando que Denis, Wagner e Kelly continuam vendo leads/clientes/propostas/pedidos de terceiros pelas permissões, e que vendedores e Supervisor ADM não mudam de escopo.
- Novo usuário de teste criado pelo formulário nasce com perfil e papel corretos.
- Nada publicado: diff completo (migrations incluídas) para revisão.
