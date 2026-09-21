# Troca do endereço do CRM (crm.inplastic.com.br → crm.aginext.com.br)

## Fonte única de endereço

`src/lib/app-url.ts` é o único lugar que decide o endereço público:

- lê `APP_PUBLIC_URL` (hoje `https://crm.inplastic.com.br`);
- só aceita valores da allowlist (`crm.inplastic.com.br`, `crm.aginext.com.br`,
  `crm-inplastic.lovable.app`, `localhost:8080`) — o endereço nunca vem do navegador;
- valor ausente/estranho cai em `https://crm.inplastic.com.br`.

Usam o helper: link da proposta pública, e-mail da proposta, convites/recuperação de
senha, avisos do Xerife no Telegram, links de conversa (watchdog, entrada do WhatsApp,
handoff e urgência da IA) e o fechamento diário.

**Para virar o endereço:** mudar apenas `APP_PUBLIC_URL` em Configurações → Segredos.
Fora do helper ficam ainda os materiais estáticos (`public/manual.html`,
`public/apresentacao.html`, `LEADS_API.md`, `HANDOVER.md`) e o domínio remetente dos
e-mails (`notify.crm.inplastic.com.br`), que é marca e não muda agora.

## Endereço técnico estável

`https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app`
Não muda com renomeação nem com troca de domínio — é onde ficam os webhooks.

## Telegram (feito em 21/09)

Antes: `https://crm.inplastic.com.br/api/public/telegram/webhook`
Depois: `https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app/api/public/telegram/webhook`

Comando de VOLTA (restaura o endereço antigo):

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"https://crm.inplastic.com.br/api/public/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"edited_message\"],\"max_connections\":40}"
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

## WhatsApp / Meta (NÃO executado — fazer junto com o Denis)

Estado lido em 21/09 (`GET /1510929654051780/subscriptions`): objeto
`whatsapp_business_account`, assinatura ativa em
`https://crm.inplastic.com.br/api/public/hooks/whatsapp-cloud`, com **três** campos
assinados (todos na versão v26.0):

- `messages`
- `message_template_status_update`
- `phone_number_quality_update`

Os comandos abaixo reenviam exatamente esses três campos — enviar só `messages`
derrubaria os outros dois. Reler a lista antes de trocar:

```bash
curl -sS "https://graph.facebook.com/$META_GRAPH_VERSION/1510929654051780/subscriptions?access_token=1510929654051780|$META_APP_SECRET"
```

O token de verificação existe (`META_WEBHOOK_VERIFY_TOKEN`) e o handshake contra o
endereço técnico já foi provado (devolveu o desafio, HTTP 200).

Antes de trocar, repetir a prova:

```bash
curl -s "https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app/api/public/hooks/whatsapp-cloud?hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN&hub.challenge=PROVA123456"
# deve imprimir: PROVA123456
```

TROCA (precisa de token com permissão de administrar o app; no painel da Meta é
WhatsApp → Configuração → Webhook → Editar):

```bash
curl -sS -X POST "https://graph.facebook.com/$META_GRAPH_VERSION/1510929654051780/subscriptions" \
  -d "object=whatsapp_business_account" \
  -d "callback_url=https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app/api/public/hooks/whatsapp-cloud" \
  -d "verify_token=$META_WEBHOOK_VERIFY_TOKEN" \
  -d "fields=messages,message_template_status_update,phone_number_quality_update" \
  -d "access_token=1510929654051780|$META_APP_SECRET"
```

VOLTA (mesmo comando com o endereço antigo):

```bash
curl -sS -X POST "https://graph.facebook.com/$META_GRAPH_VERSION/1510929654051780/subscriptions" \
  -d "object=whatsapp_business_account" \
  -d "callback_url=https://crm.inplastic.com.br/api/public/hooks/whatsapp-cloud" \
  -d "verify_token=$META_WEBHOOK_VERIFY_TOKEN" \
  -d "fields=messages,message_template_status_update,phone_number_quality_update" \
  -d "access_token=1510929654051780|$META_APP_SECRET"
```

Conferência depois da troca: enviar uma mensagem real de cliente e ver a conversa
aparecer no CRM; no painel da Meta o webhook deve ficar sem erro recente.

## Avisos automáticos (cron)

Os 9 agendamentos usam o endereço técnico. O `xerife-pedidos-hourly` (era
`crm-inplastic.lovable.app`) foi movido em 21/09 via `cron.alter_job(10, ...)`.

## Autenticação

`https://crm.aginext.com.br` ainda **não** está na lista de endereços de retorno
permitidos (testado: cai no endereço antigo). Precisa ser liberado quando o domínio
for conectado, senão o link de definir senha quebra.
