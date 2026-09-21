# Filtro por equipe em /equipe + selo de perfil no lugar do papel binário

## 1. Filtro por equipe na tela /equipe

- `resumoEquipe` (`src/lib/equipe.functions.ts`) passa a aceitar `{ equipeId?: string }` (validado com zod, uuid opcional) e repassa para `coletarResumoEquipe`.
- `coletarResumoEquipe` (`src/lib/equipe.server.ts`) ganha `opts.equipeId`; quando informado, adiciona `.eq("equipe_id", equipeId)` na query `qPessoas`.
- **AND com a restrição de acesso:** o `.in("id", opts.userIds)` já existente continua sendo aplicado sempre. O filtro de equipe é encadeado depois, nunca substitui nem condiciona o `userIds` — comentário explícito no código dizendo que o filtro só reduz, jamais amplia o que a pessoa enxerga.
- Filtro é server-side: a tela passa o `equipeId` na `queryKey` (`["equipe-resumo", equipeId]`) e refaz a busca, mantendo `data.totais` coerente.
- `<select>` no cabeçalho de `EquipePage`, dentro do `div flex items-center justify-between gap-3 flex-wrap`, entre o `<h1>` e o botão "Cobrar todos com vencidos", classes `h-9 rounded-md border border-input bg-background px-2 text-sm`. Opções: "Todas as equipes" (valor vazio, padrão) + cada equipe ativa de `listEquipes`.

### Seção "Carteira" — como o filtro mapeia (ponto que você pediu para eu avisar)

`relatorioCarteira` não lista pessoas: lista leads (por `owner_id`) e devoluções do `xerife_log` (por `vendedor_id`). Não existe `equipe_id` nessas linhas, então o filtro não é um `.eq` direto. Proposta: quando `equipeId` vier, resolver primeiro os ids das pessoas daquela equipe (mesma query de `profiles`, ativa e não excluída, já cruzada com a restrição de acesso) e filtrar os leads por `owner_id in (ids)` e as devoluções por `vendedor_id in (ids)`.

Consequência a registrar: em "dono divergente", o par lead/cliente pode atravessar equipes (lead de um vendedor da equipe A com cliente na carteira de alguém da equipe B). Com o filtro, a linha aparece quando o **dono atual do lead** é da equipe selecionada — é o critério coerente com o resto da tela (que é sempre "por pessoa responsável"). Se você preferir o critério pelo dono da carteira, diga e eu inverto.

## 2. Selo mostra o perfil de acesso, não o papel binário

**a) `listUsuarios` (`src/lib/usuarios.functions.ts`)** — adicionar ao `Promise.all` uma consulta em `user_perfis` com join `perfis(nome, base_role, ativo)`, mapa por `user_id` considerando só perfis ativos. `UsuarioRow` ganha `perfilNome: string | null` e `perfilBaseRole: "admin" | "vendedor" | null`. O campo `role` existente permanece intocado.

**b) `src/routes/usuarios.tsx`, selo na lista** — passa a exibir `r.perfilNome`; ícone `Shield` quando `perfilBaseRole === "admin"`, senão `UserIcon`. Sem perfil: `Badge variant="destructive"` com "Sem perfil" e ícone de alerta.

**c) Filtro do topo** — o `<select>` de papéis vira filtro por perfil: "Todos os perfis" + um item por perfil ativo (mesma fonte já usada na criação de usuário) + "Sem perfil". O predicado em `filtrados` compara `r.perfilNome` em vez de `r.role`.

**d) `FilaVendedoresCard`** — `<option>{v.name} ({v.role})</option>` passa a mostrar só o nome da pessoa (o perfil não agrega nada na escolha de quem entra na fila). O tipo local `Row` dessa parte carrega o que for necessário.

**e) `UserBadge` em `src/routes/__root.tsx`** — mostra `user.perfilNome` (fallback "Sem perfil"). Em `src/hooks/use-auth.tsx`, o select já existente em `user_perfis` (`perfis!inner(ativo)`) passa a trazer `perfis(nome, base_role, ativo)`; `AuthUser` ganha `perfilNome: string | null`. Nenhuma consulta nova.

## Fora do escopo

Campo "Papel" do `UsuarioEditDialog` intocado. Nenhuma mudança de permissão, RLS ou banco — nada é necessário.

## Verificação

Suíte completa, typecheck e build. Nada publicado.
