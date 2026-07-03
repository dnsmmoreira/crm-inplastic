# Etapa B — Isolamento de dados por usuário

Hoje todo o CRM roda em `localStorage` no navegador de cada pessoa. Cada usuário
tem uma "cópia" isolada dos dados por acidente (é o browser dele), o que quebra
o objetivo: admin ver tudo, vendedor ver só o dele, todos vendo os mesmos
cadastros globais (produtos, condições, empresas do grupo).

Esta etapa move os dados para o banco, com regras de acesso aplicadas no
servidor via RLS.

## Modelo de dados

Tabelas **por vendedor** (com `owner_id uuid` = quem criou):

- `leads` — clientes/oportunidades (Empresa, contato, produto, valor, etapa, tags, notas, próximas ações)
- `lead_interactions` — histórico de contato de cada lead
- `lead_ai_actions` — ações que o Agente IA executou
- `tarefas` — to-dos ligados a leads
- `propostas` + `proposta_itens` + `proposta_parcelas` — orçamentos
- `pedidos` + `pedido_itens` — pedidos emitidos a partir de propostas

Tabelas **globais** (compartilhadas, só admin edita):

- `produtos` — catálogo (SKU, dimensões, preço padrão, NCM…)
- `condicoes_pagamento` — formas de pagamento configuráveis pelo admin
- `emitters` — CNPJs do grupo (TAOPLAST, INPLASTIC, LICITAPLAS)

Não migramos (permanecem locais por serem simulações do MVP):

- Mensagens WhatsApp e slots de agenda da tela "Canais/Agente IA" — hoje são dados de demonstração; migração fica para quando integrar canal real.

## Regras de acesso (RLS)

| Tabela | Vendedor | Admin |
|---|---|---|
| leads / interações / ações IA / tarefas / propostas / itens / parcelas / pedidos | vê e edita só onde `owner_id = auth.uid()` | vê e edita tudo |
| produtos / condições / empresas | só leitura | leitura + escrita |

`ownership` de propostas e pedidos é derivada do lead (uma proposta de um lead
do Bruno pertence ao Bruno). Ao criar uma proposta, o `owner_id` é gravado
automaticamente = usuário logado.

## Camada de acesso (código)

Substituo o `crm-store` (Zustand + localStorage) por hooks baseados em
TanStack Query + `createServerFn` autenticadas:

- `useLeads()`, `useLead(id)`, `useCreateLead()`, `useUpdateLead()`…
- `useTarefas()`, `usePropostas()`, `useProposta(id)`, `usePedidos()`…
- `useProdutos()`, `useCondicoesPagamento()`, `useEmpresas()` (com mutations
  bloqueadas pra não-admin no servidor).

Todas as consultas passam pelo Supabase com a sessão do usuário → RLS aplica
o filtro por `owner_id` automaticamente. Zero lógica de "esconder" no
front-end.

## Migração de dados atuais

Faço **seed inicial** direto na migração do banco:
- Produtos, condições de pagamento e empresas do grupo (dados globais atuais)
- Não migro leads/propostas/pedidos do localStorage — hoje são dados de teste
  ("Frigorífico Sul", "AgroExport" etc.) e cada usuário só tinha no próprio
  navegador. Começamos com base limpa; a equipe cadastra os reais.

Se você quiser preservar algum lead específico do que já cadastrou, me diga
e eu abro uma tela de importação, mas o padrão é começar limpo.

## Rotas afetadas

- `pipeline.tsx`, `contatos.tsx`, `tarefas.tsx`, `propostas.index.tsx`,
  `propostas.$id.tsx`, `produtos.tsx`, `condicoes-comerciais.tsx`,
  `empresas.tsx`, `index.tsx` (dashboard), `agente-ia.tsx`, `canais.tsx`
- Todas passam a ler do banco via hooks acima; nenhuma muda visualmente.

## Ordem de execução

1. **Migração SQL** — cria todas as tabelas, RLS, políticas, grants + seed
   dos cadastros globais.
2. **Camada de servidor** — `*.functions.ts` com `createServerFn +
   requireSupabaseAuth` para cada entidade + hooks React Query.
3. **Substituição do store** — trocar `useCrm(...)` por hooks novos em todas as
   telas listadas. `crm-store.ts` deixa de existir.
4. **Verificação** — smoke test: login como admin cria lead, promove segundo
   usuário a vendedor, ele só enxerga o dele.
5. **Publicar** — subir para produção e compartilhar link com a equipe.

## Escopo e tempo

É uma reescrita grande da camada de dados. Nada muda visualmente pro usuário
final, mas mexe em ~10 rotas. Prefiro fazer em **um bloco só** pra não deixar
o app quebrado no meio (metade lendo localStorage, metade banco). Ao terminar
avaliamos qualquer ajuste antes de publicar.

Confirma que posso seguir por aqui, começando pela migração SQL?
