# /conversas em duas colunas + menu recolhível

## 1) Estrutura atual do JSX (src/routes/conversas.tsx)

- `:256` — wrapper da página `div.p-4 md:p-6`.
- `:257-269` — cabeçalho (título + botão NOVO).
- `:271-276` — `NovaConversaDialog`.
- `:278` — container do painel (grid).
- `:280-411` — **coluna esquerda**: filtros/busca/filas (`:281-342`) e a lista `ul` rolável (`:343-410`).
- `:414` — **coluna direita**: `<ChatPanel conversa={selected} onChanged={load} />` (componente definido em `:438+`).

## 2) Container/grid hoje

Linha `:278`:

```text
grid gap-0 overflow-hidden rounded-xl border bg-card
lg:grid-cols-[340px,1fr] h-[calc(100vh-13rem)] min-h-[540px]
```

Ou seja: as duas colunas **já existem**, mas só a partir de `lg` (1024px). Abaixo disso o grid é de uma coluna e fica empilhado — lista em cima, chat embaixo. Como a viewport atual é 443px, aparece empilhado. Há um segundo motivo de empilhamento no desktop: a altura fixa `h-[calc(100vh-13rem)]` não considera a nav horizontal mobile, e a lista já tem `overflow-auto` próprio (`:343`) enquanto o ChatPanel administra o seu (`scrollRef`).

## 3) Mudança mínima para virar 2 colunas de verdade

Editar apenas a linha `:278`:

- trocar o breakpoint `lg:` por `md:` e a largura para `md:grid-cols-[360px_1fr] xl:grid-cols-[380px_1fr]` (vírgula não é necessária; usar underscore evita ambiguidade no Tailwind v4).
- adicionar `md:h-[calc(100dvh-9rem)]` para o painel ocupar a altura útil, com `min-h-0` nas duas colunas (a esquerda já tem em `:280`; garantir que a direita/`ChatPanel` receba `min-h-0 flex flex-col h-full`).
- a coluna esquerda mantém o scroll próprio (`ul` em `:343` já é `min-h-0 flex-1 overflow-auto`); a direita mantém o scroll interno do ChatPanel.

Nenhuma mudança de dados, query ou realtime.

## 4) Responsivo no mobile

Abaixo de `md` mantemos **uma coluna com troca de vista** (padrão WhatsApp mobile), em vez do empilhamento atual:

- se não há `?c=` na URL → mostra só a lista (chat escondido com `hidden md:flex`);
- se há `?c=` → mostra só o chat, com um botão "voltar" no cabeçalho do ChatPanel que navega para `/conversas` sem o parâmetro (lista escondida com `hidden md:flex`).

Isso reaproveita o estado que já existe (`selectedId` vem do search param, `selecionar` em `:249-251`), sem drawer novo e sem lógica extra.

## 5) Menu lateral do CRM e recolher

- Arquivo: `src/routes/__root.tsx`, componente `AppShell` (`:164-277`).
- Sidebar desktop: `<aside className="hidden md:flex w-64 ...">` (`:176-225`); nav mobile horizontal em `:239-271`.
- **Não usa** o `SidebarProvider`/`useSidebar` do shadcn (`src/components/ui/sidebar.tsx` existe no projeto mas não é importado pelo root) e **não há nenhum estado de collapse hoje** — a largura `w-64` é fixa.

Proposta (mudança contida no `__root.tsx`):
- estado local `collapsed` em `AppShell`, persistido em `localStorage` (lido em `useEffect` para não quebrar SSR);
- `aside` passa a `w-64` / `w-16` com `transition-[width]`; quando recolhido, mostra só os ícones (labels escondidos) e `title` no link para tooltip nativo;
- botão de toggle (ícone `PanelLeftClose` / `PanelLeftOpen`) no topo da sidebar, ao lado do logo, sempre visível;
- `UserBadge` (`:334`) e o rodapé de versão adaptam para modo ícone.

Ganho direto para /conversas: recolhendo o menu, as duas colunas ficam confortáveis já em telas médias.

## Notas técnicas

- Alterações ficariam em `src/routes/conversas.tsx` (linha `:278`, classes do ChatPanel e o botão voltar no cabeçalho `:489+`) e em `src/routes/__root.tsx` (AppShell).
- Sem migração, sem tabela nova, sem alteração em `/atendimento-ia`.
