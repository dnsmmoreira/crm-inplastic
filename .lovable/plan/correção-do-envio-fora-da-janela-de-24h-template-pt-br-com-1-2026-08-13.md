# Correção do envio fora da janela de 24h (template pt_BR com {{1}})

## (a) Valores atuais de META_TEMPLATE_NAME / META_TEMPLATE_LANG

Nenhum dos dois existe nos Secrets do projeto (a lista tem apenas META_ACCESS_TOKEN, META_APP_SECRET, META_GRAPH_VERSION, META_PHONE_NUMBER_ID, META_WABA_ID, META_WEBHOOK_VERIFY_TOKEN). Em `.env.example` aparecem vazios.

Consequência no código:
- `META_TEMPLATE_NAME` → string vazia; não há default.
- `META_TEMPLATE_LANG` → cai no default do código, `pt_BR`.

Ou seja, hoje qualquer envio do sistema fora da janela de 24h é **bloqueado** com "fora_janela_24h_sem_template" (`src/lib/whatsapp-send.server.ts:328-333`). O único caminho que realmente sai fora da janela é o botão de teste do admin, que passa `templateOverride` (tipicamente `hello_world`, `en_US`) — aceito com wamid e frequentemente não entregue/irrelevante.

## (b) O código monta parâmetros do template?

`src/lib/whatsapp-send.server.ts:367-375`:

```
usarTemplate
  ? await cloudSendTemplate(phone, templateName, templateLang,
      override ? [] : [{ type: "body", parameters: [{ type: "text", text: message.slice(0,900) }] }])
```

- Caminho automático (sem override): monta **um** componente BODY com `{{1}}` = o texto integral da mensagem (até 900 chars). Errado para um template de retomada, onde `{{1}}` deve ser o nome do contato.
- Caminho do teste admin (`override`): envia **sem nenhum parâmetro** (`[]`). Se o template tiver variáveis, a Meta aceita/recusa de forma inconsistente — é a origem do "aceito com wamid, não entregue".
- `cloudSendTemplate` em `src/lib/whatsapp-cloud.server.ts:96-116` apenas repassa `components` quando o array não é vazio; ele não valida nem monta nada.

## Plano de correção

1. `src/lib/whatsapp-cloud.server.ts`
   - Adicionar helper `montarComponenteBody(params: string[])` que devolve `[{ type: "body", parameters: [{type:"text", text}] }]` com sanitização exigida pela Meta (sem quebras de linha, sem tabs, sem espaços duplicados, corte defensivo de tamanho) e `[]` quando não houver parâmetro.
   - Manter `cloudSendTemplate` como está na assinatura, apenas usando o helper para normalizar `components`.

2. `src/lib/whatsapp-send.server.ts`
   - Defaults: `META_TEMPLATE_NAME` → `retomada_atendimento`; `META_TEMPLATE_LANG` → `pt_BR`. Nunca `hello_world` como default.
   - Nova opção no motor: `templateParams?: string[]` (ou `nomeContato?: string`) para o caminho automático.
   - Fora da janela sem override: enviar o template padrão com `{{1}}` = **primeiro nome do contato**, com fallback seguro (`"tudo bem"` / `"olá"` — a definir com você) quando o nome faltar, for numérico ou for só o telefone. Deixar de mandar o corpo da mensagem inteira em `{{1}}`.
   - Guarda de produção: recusar `hello_world` (e qualquer template `*_US`) fora do botão de teste explícito do admin.

3. Origem do nome do contato (novo helper server-side, provavelmente em `whatsapp-send.server.ts` ou arquivo irmão)
   - Resolver o nome pelo telefone: `clientes` → `leads`/`contatos` → `whatsapp_conversas`, nessa ordem; extrair o primeiro nome, capitalizar, descartar valores inválidos.

4. `src/lib/zapi-painel.functions.ts`
   - Botão de teste continua podendo forçar template/idioma, mas passa a aceitar um campo opcional de parâmetro `{{1}}` e a montar o componente BODY quando informado (hoje manda `[]`).

5. `src/routes/canais.tsx`
   - Campo opcional "Parâmetro {{1}}" no bloco de teste, e o template padrão sugerido passa a ser `retomada_atendimento` / `pt_BR`.

6. `.env.example`
   - Documentar `META_TEMPLATE_NAME=retomada_atendimento` e `META_TEMPLATE_LANG=pt_BR`.

7. Testes (Vitest)
   - Extração/fallback do primeiro nome e montagem do componente BODY.

## Pendências suas antes de eu implementar
- Confirmar que o template `retomada_atendimento` está **aprovado** em `pt_BR` na WABA e que ele tem exatamente **uma** variável no BODY.
- Definir o texto do fallback quando não houver nome.
- Se quiser, cadastro `META_TEMPLATE_NAME`/`META_TEMPLATE_LANG` como Secrets (além do default no código).

Nada foi alterado e nada será publicado.
