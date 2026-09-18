# Equipes comerciais + cargo/perfil "Supervisor ADM" (somente leitura, escopo por equipe)

Segunda equipe comercial entra no sistema sem enxergar a carteira atual. O supervisor da equipe nova vê apenas leads, clientes, propostas e pedidos cujo dono está na mesma equipe que ele — e isso é configurável pessoa a pessoa (equipe dele ou empresa toda).

Nada do que existe hoje muda de comportamento: todas as regras de acesso atuais (dono, `ver_todos`/`ver_todas`, admin) ficam intactas. As regras novas são **adicionais** — só ampliam a visão de quem tiver a permissão nova.

## 1. Equipes

Tabela `equipes`: `id`, `nome`, `ativo` (default true), `created_at`, `updated_at` (com o trigger padrão). Grants: `SELECT` para `authenticated` (todo mundo precisa ler o nome da equipe nas telas), escrita só para quem gerencia usuários; `ALL` para `service_role`. RLS ligada, com política de leitura para `authenticated` e de escrita condicionada a `tem_permissao(auth.uid(),'usuarios.gerenciar')`.

Coluna `profiles.equipe_id uuid null references public.equipes(id)`, com índice.

Seed de duas linhas: **Equipe INPLASTIC** e **Equipe Nova**. Todos os 9 perfis existentes (Denis, Wagner, Renata, Kelly, Bruna, Beatriz, Bianca, Daniel, Pamela) recebem `equipe_id` da Equipe INPLASTIC no mesmo migration. O nome é só rótulo — nenhuma lógica depende do texto, então renomear é seguro.

## 2. Escopo do supervisor

Coluna `profiles.supervisor_escopo text not null default 'equipe'`, com `CHECK (supervisor_escopo in ('equipe','global'))`. Só produz efeito para quem tem alguma permissão `*.ver_equipe`; para o resto é campo inerte.

## 3. Cargo, perfil e permissões novas

- Cargo **Supervisor ADM** em `cargos` (informativo, igual aos demais — não concede nada).
- 4 permissões novas em `permissoes`, grupo correspondente, tipo booleana: `leads.ver_equipe`, `clientes.ver_equipe`, `propostas.ver_equipe`, `pedidos.ver_equipe`.
- Perfil **Supervisor ADM** em `perfis` (papel Vendas, base role vendedor, não protegido) com exatamente essas 4 permissões em `perfil_permissoes`. Sem `ver_todos`/`ver_todas`, sem permissão de edição, sem `relatorios.ver`.

Nenhum perfil existente é alterado.

## 4. Funções de apoio (SECURITY DEFINER, `search_path = public`, EXECUTE só para `authenticated`)

```sql
create or replace function public.mesma_equipe(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pa
    join public.profiles pb on pb.id = _b
    where pa.id = _a
      and pa.equipe_id is not null
      and pa.equipe_id = pb.equipe_id
  )
$$;
```

`null = null` retorna `false` porque a condição exige `equipe_id is not null` nos dois lados (o join iguala os valores). Pessoa sem equipe não casa com ninguém.

```sql
create or replace function public.supervisor_ve_tudo(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and supervisor_escopo = 'global'
  )
$$;
```

## 5. As 4 policies novas de SELECT (aditivas)

Nenhuma policy existente é tocada, renomeada ou recriada. Cada tabela ganha uma policy a mais, para `authenticated`:

```sql
create policy "leads select ver_equipe" on public.leads
for select to authenticated using (
  tem_permissao(auth.uid(), 'leads.ver_equipe')
  and (supervisor_ve_tudo(auth.uid()) or mesma_equipe(auth.uid(), owner_id))
);

create policy "clientes select ver_equipe" on public.clientes
for select to authenticated using (
  tem_permissao(auth.uid(), 'clientes.ver_equipe')
  and (supervisor_ve_tudo(auth.uid()) or mesma_equipe(auth.uid(), vendedor_id))
);

create policy "propostas select ver_equipe" on public.propostas
for select to authenticated using (
  tem_permissao(auth.uid(), 'propostas.ver_equipe')
  and (supervisor_ve_tudo(auth.uid()) or mesma_equipe(auth.uid(), owner_id))
);

create policy "pedidos select ver_equipe" on public.pedidos
for select to authenticated using (
  tem_permissao(auth.uid(), 'pedidos.ver_equipe')
  and (supervisor_ve_tudo(auth.uid()) or mesma_equipe(auth.uid(), owner_id))
);
```

Como policies de SELECT são somadas por OR, quem não tem a permissão nova continua exatamente com a visão de hoje. Registro sem dono (`owner_id`/`vendedor_id` null) não aparece para o supervisor de equipe — `mesma_equipe` devolve false. Transferência de carteira é acompanhada automaticamente: a visão segue a coluna de dono.

Nenhuma policy de INSERT/UPDATE/DELETE é criada — o Supervisor ADM é leitura pura. As server functions de escrita continuam barrando por permissão, e a RLS de escrita já não o contempla.

## 6. Telas de administração

**Ficha do usuário** (`UsuarioEditDialog`): novo seletor **Equipe** (lista de equipes ativas, mais "Sem equipe"), ao lado de Cargo/Gestor. E, apenas quando o perfil selecionado for o Supervisor ADM (detectado pelas permissões `*.ver_equipe` do perfil, não pelo nome), aparece o toggle **Escopo — Somente a equipe dele / Empresa toda**, gravando `supervisor_escopo`. `updateUsuario` passa a aceitar e validar os dois campos (equipe existente e ativa; escopo dentro dos dois valores) e registra os dois no log de auditoria, igual a cargo e gestor.

**CRUD de Equipes**: nova aba "Equipes" em `/usuarios`, no mesmo padrão visual e de código da aba Cargos — listar, criar, renomear, ativar/desativar, com contagem de pessoas por equipe e bloqueio de desativação enquanto houver gente vinculada. Server functions em `src/lib/equipes.functions.ts`, guardadas por `usuarios.gerenciar`.

## 7. Verificações antes de entregar

- Testes puros das regras novas de visibilidade e da detecção do perfil supervisor na tela.
- Conferência no banco, com usuário de teste: supervisor da Equipe Nova não enxerga nada da Equipe INPLASTIC nas 4 tabelas; com escopo `global` passa a enxergar; vendedor comum e os perfis atuais mantêm exatamente a mesma contagem de linhas de antes.
- `user_permissions` confirmada como morta (nenhuma policy ou função a lê) — apenas registrado, sem nenhuma alteração nela.

## Fora do escopo

Relatórios, dashboard, Placar e Arena com noção de equipe; Chat Interno; qualquer permissão de escrita para o Supervisor ADM.
