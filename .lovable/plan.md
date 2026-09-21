# Relatórios por equipe para o Supervisor ADM

Dar acesso a Relatórios ao perfil "Supervisor ADM", enxergando apenas os vendedores da própria equipe, sem aba global de Pedidos em Aberto.

## O que muda

1. **Permissão** — conceder `relatorios.ver` ao perfil "Supervisor ADM". (Ele já tem as quatro permissões `*.ver_equipe`; hoje não tem nenhuma de relatórios, por isso a tela fica bloqueada.)
2. **Escopo com três estados** em vez do booleano atual: `todos` (tem `pedidos.ver_todos`) → `equipe` (tem `pedidos.ver_equipe`) → `proprio`.
3. **Relatórios de Pedidos, Propostas e Processo** passam a respeitar os três estados. No estado `equipe` nenhum filtro de dono é aplicado no código: as regras de acesso do banco (`pedidos select ver_equipe`, `propostas select ver_equipe`, e a equivalente de leads) já limitam à equipe, e a consulta roda com o token do próprio usuário. Conferido no banco: essas regras existem e filtram por `mesma_equipe(auth.uid(), owner_id)`.
4. **Pedidos em Aberto** continua exigindo `pedidos.ver_todos` puro — nada muda ali. A aba já é escondida por essa mesma permissão em `relatorios.tsx`, então o item 5 do pedido já está satisfeito; só será confirmado por teste, sem alteração de código.
5. **Filtro por vendedor no relatório de Propostas** passa a aparecer também no escopo `equipe`.

## Ponto que precisa da sua confirmação

O relatório de **Propostas** hoje não usa permissão nenhuma para decidir escopo: ele libera visão ampla só para quem tem **papel de administrador** (Denis e Wagner). Trocar pelo resolvedor de permissões — como o pedido descreve — faz a **Kelly (Gestor Comercial)** passar a ver as propostas de toda a empresa nesse relatório, já que ela tem `propostas.ver_todas`. Isso é coerente com o resto do sistema (ela já vê todas as propostas na tela de Propostas), mas é uma mudança de quem vê o quê. Sigo assim, salvo instrução contrária.

## Detalhes técnicos

**Banco (uma migração):** inserir em `perfil_permissoes` a chave `relatorios.ver` para o perfil "Supervisor ADM", idempotente (`ON CONFLICT DO NOTHING`). Nada mais.

**`src/lib/relatorios.functions.ts`**
- Nova função `resolverEscopo(sb, userId): Promise<"todos" | "equipe" | "proprio">`, usando `tem_permissao` via RPC com as chaves `pedidos.ver_todos` e `pedidos.ver_equipe`, no mesmo padrão de erro (`assertRpcPermissao`) já usado.
- `escopoProprio` é substituída pelo novo resolvedor em todos os chamadores; removida para não deixar dois caminhos.
- `listPedidosRelatorio`: aplica o filtro `owner_id/vendedor_proprietario_id` apenas quando o escopo é `proprio`.
- `listPedidosEmAberto`: passa a checar explicitamente `pedidos.ver_todos`; com escopo `equipe` cai no mesmo filtro de `proprio` (nunca ganha visão de equipe).

**`src/lib/relatorio-processo.functions.ts`** — troca `escopoProprio` pelo resolvedor; filtro por `owner_id` só em `proprio`.

**`src/lib/relatorio-propostas.functions.ts`** — substitui a checagem `has_role('admin')` pelo resolvedor; filtra `owner_id = userId` só em `proprio`; aplica `data.vendedorId` quando informado nos escopos `todos` e `equipe`. O retorno troca `isAdmin: boolean` por `escopo: "todos" | "equipe" | "proprio"` (mantendo `isAdmin` derivado apenas se algum outro consumidor precisar — `MotivosRecusaCard` usa o resultado e será verificado).

**`src/components/relatorios/PropostasReport.tsx`** — o seletor de vendedor aparece quando `escopo !== "proprio"`. A lista de vendedores já é derivada das próprias propostas retornadas, que no escopo `equipe` só contêm a equipe do usuário — portanto não é preciso consultar `profiles` por `equipe_id`; sai mais simples e sem risco de listar alguém de fora.

**`src/routes/relatorios.tsx`** — sem alteração; a aba "Pedidos em Aberto" já depende de `pedidos.ver_todos`.

## Verificação

- Testes unitários novos para o resolvedor de três estados e para a decisão de filtro de cada relatório.
- Simulação no banco, sem alterar dados, confirmando: Lais vê pedidos/propostas/leads apenas da equipe Maxicaixa e zero de terceiros; vendedor comum continua vendo só o próprio; Denis/Wagner/Bruna seguem com a visão atual.
- Suíte completa, verificação de tipos e compilação. Nada publicado.
