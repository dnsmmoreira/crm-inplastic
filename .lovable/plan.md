# Inventário: Xerife + Receptor do Webhook Z-API

Somente investigação. Nenhum arquivo alterado.

## ASSUNTO A — XERIFE

### 1) Onde está o código

Rotas/motores (todos `createFileRoute` públicos):
- `src/routes/api/public/hooks/xerife.ts:1-502` — `runXerife()` (`:61`), `runResumoDiario()` (`:288`), `sendZapiText()` local (`:34`, wrapper de `@/lib/zapi-send.server`), `loadConfig()` (`:~50`), handler POST (`:468`).
- `src/routes/api/public/hooks/xerife-engine.ts:1-693` — `runXerifeEngine()` (motor de cadência Fase 2), `alertDiretoria()` (`:214`), `criarTarefa` (`:~185`), `marcarEsfriando` (`:229`), handler (`:663`).
- `src/routes/api/public/hooks/xerife-agenda-diaria.ts:1-180` — `runAgendaDiaria()`, envio em `:130`, handler `:153`.
- `src/routes/api/public/hooks/xerife-checkpoint.ts:1-107` — `runCheckpoint()`, envio em `:61`, handler `:80`.
- `src/routes/api/public/hooks/xerife-fechamento.ts:1-236` — `runFechamento()`, envios em `:83`, `:148`, `:183`, handler `:209`.
- `src/routes/api/public/hooks/xerife-pedidos.ts:1-455` — `runXerifePedidos()`, handler `:424`. **Não envia WhatsApp** (`:3-6`), só cria tarefas + `xerife_log`.

Bibliotecas de apoio:
- `src/lib/xerife/notify.server.ts:12` `getOwnerPhone`, `:24` `notifyOwner`, `:39` `notifyDiretoria`, `:52` `crmLeadLink`.
- `src/lib/xerife/dedupe.server.ts:14` `alreadyActed`, `:30` `hasOpenTask`, `:44` `logAction`.
- `src/lib/xerife/businessTime.server.ts:1-144` (janela útil), `src/lib/xerife/rollover.server.ts:1-70` (+ teste `rollover.server.test.ts`).

Server functions (UI admin):
- `src/lib/xerife.functions.ts:13` `getXerifeConfig`, `:118` `updateXerifeConfig`, `:131` `listAiActions`, `:169` `runXerifeNow`, `:178` `runResumoDiarioNow`, `:187` `runXerifeEngineNow`, `:196` `simulateXerifeEngine`, `:205` `runAgendaDiariaNow`, `:214` `runCheckpointNow`, `:223` `runFechamentoNow`, `:232` `runXerifePedidosNow`, `:241` `simulateXerifePedidos`.
- `src/lib/xerife-cadencia.functions.ts:1-237` (leitura de cadência/leads esfriando).
- UI: `src/components/xerife/XerifeConfigForm.tsx`, `CadenciaPanel.tsx`, `XerifeSimulator.tsx`; MCP: `src/lib/mcp/tools/xerife_config_view.ts`, `xerife_log_recent.ts`.

### 2) Gatilhos de disparo automático

`pg_cron` (banco, todos `active=true`, horários em UTC):
- jobid 2 `xerife-hourly` — `0 10-23 * * *` → POST `/api/public/hooks/xerife` (header `x-xerife-secret`).
- jobid 3 `xerife-digest-daily` — `0 11 * * *` → `/api/public/hooks/xerife?mode=digest` (resumo diário).
- jobid 4 `xerife-engine-15min` — `*/15 10-23 * * 1-5` → `/api/public/hooks/xerife-engine`.
- jobid 5 `xerife-agenda-diaria` — `30 10 * * 1-5`.
- jobid 6 `xerife-checkpoint` — `0 16 * * 1-5`.
- jobid 7 `xerife-fechamento` — `0 21 * * 1-5`.

Não há trigger de banco nem edge function agendada. Gatilhos manuais pelo front (admin): `src/lib/xerife.functions.ts:169,178,187,196,205,214,223,232` chamados pelos componentes em `src/components/xerife/*`.

Pontos de envio efetivo:
- `src/routes/api/public/hooks/xerife.ts:137` (alerta urgente por lead), `:401` (resumo vendedor), `:443` (resumo admin).
- `xerife-engine.ts:225` (`notifyDiretoria`).
- `xerife-agenda-diaria.ts:130`, `xerife-checkpoint.ts:61`, `xerife-fechamento.ts:83,148,183`.

### 3) Destinatários e origem do número

- Vendedor/admin dono do lead: `profiles.telefone_whatsapp` — lido em `src/lib/xerife/notify.server.ts:14-19` e em `src/routes/api/public/hooks/xerife.ts:110-117` (cache local), `:389`, `:441`.
- Diretoria: variável de ambiente `WHATSAPP_DIRETORIA` — `src/lib/xerife/notify.server.ts:40`; mesmo env em `src/routes/api/public/hooks/ia-urgente.ts:146`.
- Nenhum número hardcoded no código. Nunca é enviado ao lead nos fluxos Xerife (`notify.server.ts:1-5`).
- Link de CRM fixo no texto: `https://crm.inplastic.com.br/pipeline?lead=...` (`notify.server.ts:53`).

### 4) Mesma instância Z-API do atendimento

Sim. Todos os caminhos passam por `sendZapiText` em `src/lib/zapi-send.server.ts:25-63`, que lê `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` de `process.env` (`:30-32`) e monta `https://api.z-api.io/instances/{id}/token/{token}/send-text` (`:47`). Mesmo helper usado por: Xerife (`notify.server.ts:30,43`, `xerife.ts:36`), IA (`ia-responder.ts:67`, `ia-urgente.ts:152`) e envio manual (`src/lib/canais.functions.ts:34`, `src/lib/zapi.functions.ts:22`). Status da instância: `src/lib/zapi.functions.ts:41`.

### 5) Liga/desliga sem remover código

- `xerife_config.ativo` (id=1) — checado em `xerife.ts:73` e `xerife-engine.ts:155`. **Valor atual: `true`**.
- `xerife_config.resumo_diario_ativo` — checado em `xerife.ts:298`. **Valor atual: `true`**.
- Janela horária: `xerife_config.horario_comercial_inicio/fim` (`xerife.ts:85-97`).
- Env `WHATSAPP_DIRETORIA` vazio ⇒ alertas de diretoria viram no-op (`notify.server.ts:40-41`).
- Envs Z-API ausentes ⇒ `sendZapiText` lança e nada é enviado (`zapi-send.server.ts:39-44`).
- Segredo `XERIFE_SECRET` (`xerife.ts:469`); os jobs 4-7 usam apenas `apikey` publishable — sem segredo próprio.
- Cada job pode ser desativado individualmente em `cron.job.active`.
- `xerife-pedidos` já é permanentemente sem WhatsApp por design.

### 6) Frequência / volume estimado

Execuções por dia útil: 14 (hourly) + 1 (digest) + ~56 (engine 15min) + 3 (agenda/checkpoint/fechamento) ≈ 74 execuções.

Mensagens WhatsApp por dia (não por execução), com dedupe:
- Resumo diário: 1 por vendedor com pendências + 1 por admin — hoje ~3 vendedores + admins ⇒ ~3-5.
- Agenda diária 07:30, checkpoint 13:00, fechamento 18:00: até 1 por vendedor cada ⇒ até ~9.
- Fechamento diretoria: 1.
- Alertas urgentes: cap de 1/lead/24h (`xerife.ts:124-132`); engine dedupa por `(regra, lead_id)` em `xerife_log` (`dedupe.server.ts:14-27`).

Medição real: `xerife_log` = 127 ações nos últimos 7 dias (~18/dia útil, majoritariamente tarefas, não WhatsApp); `lead_ai_actions` com `metadata.channel='whatsapp'` = 1 nos últimos 7 dias. Ou seja, volume atual efetivo de WhatsApp do Xerife é baixo (ordem de ~10-15/dia útil, dominado pelos resumos), com teto estrutural de ~1 mensagem por vendedor por rotina.

## ASSUNTO B — RECEPTOR DO WEBHOOK Z-API

### 7) Arquivo do POST

`src/routes/api/public/zapi/webhook.ts:36-211`; handler POST em `:40`, `OPTIONS` em `:39`. Sem verificação de assinatura/segredo — endpoint aberto sob `/api/public/*`.

### 8) Tipos de mensagem tratados

Tratado: **apenas texto**, lido de `payload.text.message` ou `payload.message` (`:51-54`).
Filtros anteriores: `fromMe` e `isGroup` são descartados (`:45-47`).

Não tratados (nenhum código os lê): `image`, `audio`, `ptt`, `document`, `video`, `sticker`, `location`, `contact`, `reaction`, `buttonsResponseMessage`/`listResponseMessage` (reply de botão/lista), `quotedMessage`/reply contextual, status de entrega. O campo `payload.type` (`:14`) é declarado no tipo mas nunca usado em nenhuma ramificação.

### 9) O que acontece com não-texto

Ignora silenciosamente com 200: como `message` fica vazio, cai no early return `:56-58` → `{ ok: true, skipped: "no-text" }`. Consequências:
- Não grava em `zapi_inbox` (o insert bruto está depois, em `:67`) — ou seja, nem auditoria bruta do não-texto existe.
- Não cria/atualiza conversa nem mensagem.
- Não notifica o n8n — o agente simplesmente não vê a mensagem; para o cliente parece que a IA não respondeu. Não há erro nem quebra de fluxo.

### 10) Deduplicação por messageId

Não existe. `payload.messageId` é lido em `:61` e gravado em `whatsapp_mensagens.external_id` (`:134`) — essa é a única coluna que guarda o id externo. Índices em `whatsapp_mensagens`: apenas `whatsapp_mensagens_pkey (id)` e `whatsapp_mensagens_conversa_idx (conversa_id, created_at)`. **Não há coluna única nem índice único sobre `external_id`**, e o código nunca consulta `external_id` antes de inserir. `zapi_inbox` também aceita duplicatas (insert direto em `:67`).

### 11) Retry / reentrega

Não há tratamento. Se a Z-API reentregar o mesmo `messageId` (ex.: timeout do nosso lado — o fetch ao n8n é aguardado com até 8s, `:176-186`, o que aumenta a chance de timeout na Z-API), o webhook:
- insere nova linha em `zapi_inbox` e nova linha em `whatsapp_mensagens` com o mesmo `external_id`;
- dispara **novamente** o POST ao n8n (`:178`) com o histórico, sem qualquer trava.

Risco real de resposta duplicada do agente, já que o `ia-responder` também não dedupa (só checa `ia_ativa`, `src/routes/api/public/hooks/ia-responder.ts:59`).

### 12) Envio ativo/outbound sem mensagem do lead

Para o **lead/cliente**:
- `src/lib/canais.functions.ts:34-40` — `sendConversaMessage`, envio manual do vendedor (autor='vendedor'), pode iniciar conversa.
- `src/lib/zapi.functions.ts:18-27` — `sendWhatsapp`, envio livre para qualquer telefone por usuário autenticado.
- `src/routes/api/public/hooks/ia-responder.ts:67` — chamado pelo n8n; na prática reativo, mas o endpoint aceita disparo a qualquer momento para qualquer `conversa_id` com `ia_ativa=true`, sem checar se houve mensagem de entrada.

Para **usuários internos** (não-lead): Xerife (`xerife.ts:137,401,443`; `notify.server.ts:31,44`; agenda/checkpoint/fechamento) e `ia-urgente.ts:156` (diretoria) — todos outbound iniciados pelo sistema.
