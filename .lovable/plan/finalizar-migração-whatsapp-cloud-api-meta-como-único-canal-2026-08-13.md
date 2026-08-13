# Finalizar migração WhatsApp: Cloud API (Meta) como único canal

## (b) Confirmação: o helper de envio Cloud já existe

- `src/lib/whatsapp-cloud.server.ts` — camada crua da Meta: `cloudSendText`, `cloudSendTemplate`, `cloudHealth`, diagnóstico e registro do número. É o mesmo caminho usado pelo botão "Testar WhatsApp Cloud".
- `src/lib/whatsapp-send.server.ts` — motor de saída com todas as guardas (disjuntor, opt-out, janela de horário, rate limit, jitter, retry, anti-duplicado) e a **regra das 24h**: dentro da janela envia texto de sessão, fora envia template aprovado (`META_TEMPLATE_NAME` / `META_TEMPLATE_LANG`). É a função `sendZapiText` (nome legado) exportada também como `sendWhatsappText`.
- `src/lib/zapi-send.server.ts` hoje é apenas um arquivo-ponte que re-exporta o motor acima — **não fala com a Z-API**.

Ou seja: o envio comercial (IA "Lucas", `sendConversaMessage`, fila da IA, teste do admin) **já sai 100% pela Cloud API**. O que resta de Z-API é recebimento legado, presença (lida/digitando), alerta interno e UI.

## (a) Plano e arquivos a alterar

### 1. Envio — consolidar nomes e remover a ponte
- Renomear o export para `sendWhatsappText` como nome principal em `src/lib/whatsapp-send.server.ts` (mantendo o comportamento e todas as guardas).
- Excluir `src/lib/zapi-send.server.ts` e apontar os importadores direto para `whatsapp-send.server`: `src/lib/ia-fila.server.ts`, `src/lib/canais.functions.ts`, `src/lib/xerife/notify.server.ts`.
- Sem qualquer fallback para Z-API (o driver já rejeita valor diferente de `cloud`; a chave `WHATSAPP_DRIVER` será removida do código).

### 2. Presença (marcar como lida / digitando)
- `src/lib/zapi-presenca.server.ts`: hoje chama `api.z-api.io`. Substituir por "marcar como lida" via Cloud API (`messages` com `status: read`) e remover o "digitando" (a Meta não oferece). Arquivo passa a se chamar `src/lib/whatsapp-presenca.server.ts`.
- Ajustar o import em `src/lib/ia-fila.server.ts`.

### 3. Alerta interno (Xerife)
- `src/lib/xerife/notify.server.ts`: remover o ramo `ZAPI_INTERNO_*` e o envio pelo número interno. Alertas internos passam a sair só por Telegram (já implementado), com registro de falha em `zapi_alertas` preservado.

### 4. Recebimento Z-API — remover
- Excluir as rotas `src/routes/api/public/zapi/webhook.ts`, `status.ts`, `conectado.ts`, `desconectado.ts` (já deprecadas, sem tráfego novo).
- Excluir `src/lib/zapi-eventos.server.ts` e `src/lib/zapi.functions.ts` (status da instância Z-API).
- Manter intacto o recebimento Cloud: `src/routes/api/public/hooks/whatsapp-cloud.ts` e `src/lib/whatsapp-inbound.server.ts`.

### 5. UI de Canais
- `src/routes/canais.tsx`: remover o card "Z-API (WhatsApp)" com URL de webhook e "Testar conexão", remover o badge de status da instância Z-API e o uso de `zapiStatus`. Trocar o rótulo "integração Z-API" por "WhatsApp Cloud API (Meta)" e o rótulo do canal para "WhatsApp Business (Cloud API)". **Mantidos**: Diagnóstico Cloud, registro do número, inscrição da WABA e o botão de teste de envio.
- `src/lib/zapi-painel.functions.ts`: remover a seção de diagnóstico das variáveis `ZAPI_INTERNO_*`; manter métricas de envio/alertas e as funções Cloud.

### 6. Limpeza final
- Remover `scripts/test-zapi-inbox-rls.ts` e o utilitário `src/lib/zapi-normalize.ts` se ficarem sem uso (verifico antes de excluir).
- Remover chaves `ZAPI_*` de `.env.example` e das referências em `HANDOVER.md`.

## O que NÃO muda
- Webhook Cloud (GET verify + POST HMAC) e todo o pipeline de entrada.
- Guardas de envio: janela 07:00–20:00, bloqueio de domingo, rate limits, opt-out, disjuntor — exceto o botão de teste do admin, que continua ignorando só a janela de horário.
- Tabelas históricas (`zapi_inbox`, `zapi_eventos`, `zapi_estado`, `zapi_alertas`, `zapi_envios`) permanecem com os dados; nenhuma migration destrutiva.
- Nada é publicado.

## Detalhe técnico
Nenhuma mudança de schema. Os nomes de tabela legados com prefixo `zapi_` continuam (renomear exigiria migration e reescrita ampla); só o código e a UI deixam de mencionar Z-API como integração ativa.
