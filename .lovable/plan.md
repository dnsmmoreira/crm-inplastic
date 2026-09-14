# Chat Interno (mensagens entre usuários do CRM)

Nova tela `/chat-interno` com conversa direta 1:1 entre usuários e um canal fixo "Geral".
Nada do WhatsApp (`/conversas`, tabelas `whatsapp_*`), Xerife ou IA é tocado.

## O que o usuário vai ver

- Item novo no menu, "Chat Interno" (balão de mensagem), visível para qualquer usuário ativo, com contador de mensagens não lidas.
- Coluna esquerda: "Geral" fixo no topo com contador; abaixo, os outros usuários ativos, ordenados pela mensagem mais recente, e quem nunca conversou no fim (clicável para iniciar).
- Coluna direita: bolhas de mensagem (as suas à direita; no Geral aparece o primeiro nome de quem escreveu), campo de texto com Enviar, Enter envia e Shift+Enter quebra linha, limite de 4000 caracteres, rolagem automática para o fim e atualização ao vivo.
- Abrir uma conversa marca tudo como lido.
- Sino de notificações: só mensagem direta gera aviso. Mensagem no Geral aparece apenas no contador de não lidas.

## Banco de dados

Modelo exatamente como o combinado — sem contraproposta.

- `chat_canais`: `id`, `tipo` CHECK em ('geral','direto'), `nome`, `par_chave` UNIQUE (só em 'direto', `least||':'||greatest`), `criado_em`.
- `chat_canal_membros`: `canal_id`, `user_id`, `last_read_at`, UNIQUE(canal_id,user_id).
- `chat_mensagens`: `id`, `canal_id`, `autor_user_id`, `conteudo` CHECK length 1..4000, `criado_em`. Índice em (canal_id, criado_em).
- GRANTs explícitos: `authenticated` (SELECT nas três; INSERT em `chat_mensagens`; UPDATE de `last_read_at` em `chat_canal_membros`) e `service_role`. Nada para `anon`.
- RLS: `chat_canal_membros` só a própria linha (`user_id = auth.uid()`); `chat_mensagens` leitura/escrita só para quem é membro do canal, com `autor_user_id = auth.uid()` no insert; `chat_canais` leitura só para membro. Sem INSERT direto do cliente em `chat_canais`/`chat_canal_membros`.
- Função auxiliar `chat_e_membro(_canal_id uuid, _user_id uuid)` SECURITY DEFINER para evitar recursão de RLS entre membros e mensagens.
- RPC `chat_obter_ou_criar_canal_direto(_outro_user_id uuid) returns uuid` SECURITY DEFINER: busca pelo `par_chave` e cria canal + 2 membros; em corrida trata 23505 e relê (mesmo padrão do `ensurePedidoFromProposta`). EXECUTE só para `authenticated`, REVOKE de PUBLIC/anon.
- Canal "Geral": uma linha fixa; backfill de membros com todo `profiles` ativo; trigger em `profiles` (insert ativo ou `ativo` virando true) insere a linha de membro no Geral.
- Notificação de DM: trigger AFTER INSERT em `chat_mensagens` SECURITY DEFINER — se o canal for 'direto', insere em `notificacoes` para o outro membro (`tipo = 'chat_interno_dm'`, `titulo` com o nome do autor). Canal 'geral' não notifica. O sino hoje aponta para `/atendimento-ia`; será ajustado para levar ao Chat Interno quando a notificação for desse tipo.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens, public.chat_canal_membros`.

## Frontend

- `src/routes/chat-interno.tsx`: layout duas colunas, lista de conversas + thread.
- `src/lib/chat-interno.ts`: funções puras (ordenação da lista, contagem de não lidas por `last_read_at`, primeiro nome) com testes unitários.
- `src/lib/chat-interno.functions.ts`: leitura da lista de usuários ativos e resumo das conversas via server function autenticada; envio e `last_read_at` direto pelo client (RLS cobre).
- Realtime: canal por conversa aberta, desmontado ao trocar; um canal leve por usuário para alimentar o contador do menu.
- Reaproveita `useAutoScrollMensagens` e o estilo de bolha já existente (componente próprio, sem alterar `BolhaMensagem` do WhatsApp).
- `__root.tsx`: item de menu novo com badge (mesmo mecanismo do badge de pendências).

## Entrega

Suíte completa (`bunx vitest run`) e typecheck, depois diff completo com as migrações para revisão. Sem publicar.
