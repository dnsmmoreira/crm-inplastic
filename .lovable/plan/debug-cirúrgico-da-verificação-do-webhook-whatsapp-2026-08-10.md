# Debug cirúrgico da verificação do webhook WhatsApp

## Alteração
- Modificar somente o handler `GET` de `src/routes/api/public/hooks/whatsapp-cloud.ts`.
- Aplicar `trim()` ao `hub.verify_token` recebido antes da comparação.
- Manter a função existente de comparação em tempo constante.
- Substituir o aviso genérico por diagnóstico exclusivo:
  - `motivo=modo_invalido` quando `hub.mode !== "subscribe"`;
  - `motivo=secret_ausente` quando `META_WEBHOOK_VERIFY_TOKEN` estiver vazio ou ausente;
  - `motivo=token_divergente` quando ambos existirem e não coincidirem.
- No caso divergente, registrar somente `len_esperado`, `len_recebido` e `igual_apos_trim`, sem conteúdo, fragmento ou hash dos tokens.
- Preservar o status `403`, o POST, o HMAC, banco e todos os demais arquivos.

## Validação
- Conferir os ramos do GET e executar a verificação automatizada disponível sem publicar.
- Informar ao final apenas as linhas alteradas no formato `arquivo:linha`.