# Inventário de acoplamento com a Z-API

Somente levantamento. Nenhum arquivo de código foi alterado e nada é proposto aqui.

## 1. Pontos que chamam a Z-API

Todo o tráfego HTTP para `api.z-api.io` passa por dois arquivos:

- `src/lib/zapi-send.server.ts:47` — monta `https://api.z-api.io/instances/{instanceId}/token/{token}/send-text` e faz o POST em `:49-56` com `{ phone, message }`. Único envio existente (somente texto).
- `src/lib/zapi.functions.ts:41` — monta `https://api.z-api.io/instances/{instanceId}/token/{token}/status` e faz GET em `:42` (checagem de conexão).

Credenciais (lidas de `process.env`, nunca no cliente):

- `src/lib/zapi-send.server.ts:30-32` — `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`; header obrigatório `Client-Token` em `:53`.
- `src/lib/zapi.functions.ts:36-38` — mesmas três variáveis; header `Client-Token` em `:42`.

Chamadores de `sendZapiText` (todos indiretos, via import dinâmico):

- `src/lib/canais.functions.ts:34-35` — envio manual do vendedor na tela de Canais.
- `src/lib/zapi.functions.ts:22-23` — server fn `sendWhatsapp` (envio avulso por telefone).
- `src/routes/api/public/hooks/ia-responder.ts:67-68` — resposta da IA (n8n) ao cliente.
- `src/routes/api/public/hooks/ia-urgente.ts:152-156` — alerta para o número da diretoria.
- `src/lib/xerife/notify.server.ts:30-31` (notifyOwner) e `:43-44` (notifyDiretoria) — notificações internas; telefone do vendedor vem de `profiles.telefone_whatsapp` (`:14-19`), diretoria de `process.env.WHATSAPP_DIRETORIA` (`:40`).
- `src/routes/api/public/hooks/xerife.ts:34-41` (wrapper) usado em `:137`, `:401`, `:443`.
- Consumidores de notify: `xerife-fechamento.ts:83,148,183`, `xerife-engine.ts:225`, `xerife-checkpoint.ts:61`, `xerife-agenda-diaria.ts:130`.

UI acoplada: `src/routes/canais.tsx:27` (import `zapiStatus`), `:126` rótulo "WhatsApp Business (Z-API)", `:430-465` card com URL de webhook `/api/public/zapi/webhook` (`:438`) e botão "Testar conexão" (`:431,446-451`).

Não existe nenhum envio de mídia, template, botão ou lista. Só `send-text`.

## 2. Webhook de recebimento — campos lidos e destino

Arquivo único: `src/routes/api/public/zapi/webhook.ts`.

| Campo do payload Z-API | Linha | Destino |
| --- | --- | --- |
| `fromMe` | :45 | filtro (ignora e retorna `ignored:true`) |
| `isGroup` | :45 | filtro (ignora) |
| `phone` | :49-50 | `zapi_inbox.phone`, `whatsapp_conversas.phone` (só dígitos, via `onlyDigits`) |
| `text.message` ou `message` | :51-54 | `zapi_inbox.message`, `whatsapp_mensagens.conteudo`, e `last_message_preview` (via trigger) |
| `senderName` ou `chatName` | :60 | `zapi_inbox.name`, `whatsapp_conversas.name` (`:92-98` só preenche se estava NULL) |
| `messageId` | :61 | `whatsapp_mensagens.external_id` (`:134`) |
| payload inteiro | :64,72 | `zapi_inbox.raw` (jsonb) |

Efeitos colaterais: upsert da conversa por telefone (`:83-122`), vínculo automático ao lead por `leads.telefone_whatsapp` (`:101-105`), insert da mensagem com `direcao='entrada'`, `autor='cliente'` (`:127-135`), e notificação síncrona ao n8n com histórico das últimas 20 mensagens (`:144-197`).

Campos da Z-API não lidos: `type`, `momment`, `instanceId`, `photo`, `broadcast`, `referenceMessageId`, `status`, e todos os blocos de mídia.

## 3. Tipos de mensagem tratados

- Tratado: **apenas texto** (`payload.text.message` / `payload.message`), `webhook.ts:51-54`.
- Não tratados: imagem, áudio/PTT, documento, vídeo, figurinha, localização, contato, reply (`referenceMessageId` ignorado), reação, enquete, botão/lista.
- O que acontece com os não tratados: como não há `message`, o handler cai em `:56-58` e retorna `{ ok:true, skipped:"no-text" }` — **nada é gravado**, nem em `zapi_inbox`, nem em `whatsapp_mensagens`. A mensagem do cliente desaparece silenciosamente (só fica o log do provedor).
- Mensagens de grupo e mensagens enviadas pelo próprio número (`fromMe`) também são descartadas (`:45`), o que inclui envios feitos pelo celular fora do CRM.

## 4. Persistência de telefone / chatId / messageId

- **Telefone**: normalizado só com dígitos em `webhook.ts:50`. Gravado em `zapi_inbox.phone` e `whatsapp_conversas.phone`. É **chave de negócio**: existe `UNIQUE INDEX whatsapp_conversas_phone_key ON whatsapp_conversas(phone)` e o lookup de conversa é `eq("phone", phone)` (`:86`). O vínculo ao lead usa `leads.telefone_whatsapp` (`:104`).
  - Normalização divergente entre módulos: o webhook grava só dígitos sem forçar DDI; `src/lib/canais.functions.ts:9-13` e `src/lib/zapi-send.server.ts:12-16` prefixam `55` no envio. Ou seja, o mesmo contato pode ter formatos diferentes entre gravação e envio.
- **chatId**: não é lido nem persistido em lugar nenhum.
- **messageId**: gravado em `whatsapp_mensagens.external_id` (`:134`). **Não tem índice nem UNIQUE** (índices existentes: `whatsapp_mensagens_pkey` e `whatsapp_mensagens_conversa_idx`), portanto não há deduplicação por reentrega do webhook. Nas mensagens de saída (`canais.functions.ts:37-43`, `ia-responder.ts:78-83`) o `external_id` fica NULL — o ID retornado pela Z-API é descartado.
- Chaves primárias reais são `uuid` gerado no banco nas três tabelas.

## 5. Status de entrega e fila/retentativa

- **Não existe** tratamento de status de entrega. Nenhum handler para os callbacks `MessageStatusCallback` (SENT/RECEIVED/READ) da Z-API; `whatsapp_mensagens` não tem coluna de status/timestamps de entrega ou leitura.
- **Não existe fila nem retentativa de saída** para mensagens de cliente. `sendZapiText` faz um `fetch` único e lança erro em falha (`zapi-send.server.ts:59-62`); o chamador propaga (`canais.functions.ts:35`) ou apenas loga e segue (`notify.server.ts:33-36`, `xerife.ts:39-41`). Em falha de envio manual, **nada é gravado** em `whatsapp_mensagens` — a mensagem some.
- Existe fila com idempotência apenas para o módulo de Pedidos (`pedido_notificacoes`, com `evento_id` e coluna `tentativas`), mas ela **não** despacha via WhatsApp (flag de dispatch desligada) e não cobre o canal de conversas.
- `zapi_inbox.processed` existe e tem índice, mas nenhum código do projeto marca ou consome esse flag — é log bruto morto.

## 6. Dependências de comportamento que a API oficial da Meta não oferece

- **Envio livre fora da janela de 24 h** — este é o acoplamento mais forte. Todo envio é texto livre, sem conceito de template aprovado:
  - `xerife/notify.server.ts:24-50` e todos os hooks do Xerife (`xerife-agenda-diaria.ts:130`, `xerife-checkpoint.ts:61`, `xerife-fechamento.ts:83,148,183`, `xerife-engine.ts:225`, `xerife.ts:137,401,443`) disparam por cron/regra, sem mensagem prévia do destinatário.
  - `ia-urgente.ts:152-156` dispara para a diretoria a qualquer hora.
  - `zapi.functions.ts:18-27` (`sendWhatsapp`) permite envio para telefone arbitrário sem conversa existente.
  - Observação: a maior parte desses destinatários é interna (vendedores e diretoria), o que na API oficial exige que cada número interno seja um contato que iniciou conversa ou que se use template — hoje isso é irrestrito.
- **Número da instância pareado ao aparelho** — `zapi.functions.ts:32-45` e o card em `canais.tsx:430+` expõem "estado da instância / conectado", conceito de aparelho pareado que não existe na Cloud API (não há QR code nem status de conexão de celular).
- **Mensagens enviadas pelo próprio celular** — o webhook descarta `fromMe` (`webhook.ts:45`); a Cloud API simplesmente não entrega esses eventos, então qualquer expectativa de captar conversa feita no aparelho deixa de existir.
- **Grupos** — hoje são explicitamente ignorados (`webhook.ts:45`); a API oficial não suporta grupos, então não há regressão, apenas confirmação de que nada depende disso.
- Não há uso de: leitura de histórico do aparelho, listagem de contatos, listagem de grupos, presença (online/digitando), nem marcar como lido. Nenhuma chamada a esses recursos existe no código.

## Resumo do acoplamento

O acoplamento a HTTP/credenciais da Z-API está concentrado em 2 arquivos (`zapi-send.server.ts`, `zapi.functions.ts`) e 1 webhook (`api/public/zapi/webhook.ts`). O acoplamento **semântico** é maior: telefone como chave única de conversa, ausência de status de entrega, ausência de dedupe por `messageId`, suporte só a texto e envio proativo irrestrito fora da janela de 24 h.
