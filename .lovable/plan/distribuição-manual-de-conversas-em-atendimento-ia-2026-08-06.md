# Distribuição manual de conversas em /atendimento-ia

## Situação atual

- 19 conversas estão com a IA (`ia_atendendo`) e **nenhuma** tem responsável.
- Vendedores ativos: BEATRIZ, BIANCA, DANIEL F. MOREIRA, KELLY, PAMELA.
- Hoje o admin só consegue atribuir uma conversa por vez, e apenas depois de abrir a conversa (seletor no cabeçalho do painel).

## O que será construído

Um painel de **distribuição manual em lote**, visível só para admin, na página Atendimento IA.

- Botão "Distribuir conversas" no topo da página, com um contador das conversas sem responsável.
- Ao clicar, abre um diálogo listando todas as conversas sem responsável, da mais antiga para a mais nova, mostrando: nome do contato, telefone, há quanto tempo está parada e um marcador quando a conversa pediu atendimento humano.
- Ao lado de cada conversa, um seletor com os vendedores ativos — o admin escolhe individualmente quem fica com cada uma.
- Atalhos de apoio, sem nada automático: "aplicar este vendedor às restantes" e "limpar escolhas".
- Um botão "Salvar atribuições" grava apenas as linhas em que o admin escolheu alguém; conversas deixadas em branco continuam sem responsável.
- Ao salvar, mensagem de confirmação com o total atribuído e a lista se atualiza sozinha.

Cada atribuição dispara a notificação já existente para o vendedor (sino), e o vendedor passa a enxergar a conversa na própria tela.

O seletor individual já existente no cabeçalho da conversa permanece como está.

## Detalhes técnicos

- `src/lib/atendimento.functions.ts`
  - Nova server fn `listarConversasSemAtribuicao` (admin): retorna id, name, phone, last_message_at, requer_humano das conversas `ia_atendendo` com `atribuido_para IS NULL`, ordenadas por `coalesce(last_message_at, created_at)` ascendente.
  - Nova server fn `atribuirConversasEmLote` (admin): recebe `Array<{ conversaId, vendedorId }>`, valida `has_role(admin)`, valida que cada `vendedorId` tem role `vendedor` e perfil ativo, e aplica um update por conversa apenas onde `atribuido_para IS NULL` (evita sobrescrever atribuição feita nesse meio-tempo). Retorna `{ atribuidas, ignoradas }`.
  - Reaproveita `listarVendedoresAtendimento` para a lista de vendedores.
- Novo componente `src/components/atendimento/DistribuirConversasDialog.tsx` com a tabela de escolha (Dialog + Select do shadcn), estado local `Record<conversaId, vendedorId>`, sem escrita até o clique em salvar.
- `src/routes/atendimento-ia.tsx`: renderiza o botão/diálogo só quando `user?.role === "admin"`, e chama `load()` após salvar.
- Sem migration: as colunas `atribuido_para`/`atribuido_em`, o gatilho de notificação e as políticas de RLS já existem e cobrem o caso.
