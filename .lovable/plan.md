# Troca do endereço do CRM para crm.aginext.com.br — preparação

Objetivo desta etapa: deixar o sistema pronto para a troca **sem mudar o endereço ainda**. O CRM continua respondendo em `crm.inplastic.com.br`, a marca continua INPLASTIC (tela de entrada, remetente de e-mail, nomes) e nada é publicado.

Ordem obrigatória: primeiro a fonte única de endereço, depois liberar o endereço novo na entrada, depois tirar WhatsApp e Telegram do domínio. Só quando o Denis confirmar que `crm.aginext.com.br` abre o CRM é que o endereço muda de fato.

---

## 1. Um único lugar que define o endereço

Hoje o endereço está escrito à mão em oito pontos do sistema. Criar um único ponto de verdade e apontar todos eles para lá.

Novo arquivo `src/lib/app-url.server.ts`:
- `appBaseUrl()` — lê `APP_PUBLIC_URL`, valida contra a lista de endereços permitidos, cai em `https://crm.inplastic.com.br` se vier algo estranho (mesma regra de segurança que já existe hoje nos convites: endereço nunca vem do navegador).
- `appUrl(caminho)` — monta o endereço completo.
- `appHost()` — versão sem `https://`, para os textos do Telegram que hoje mostram "crm.inplastic.com.br/equipe".

Pontos que passam a usar o helper:

| Onde | O que é hoje |
| --- | --- |
| `src/lib/propostas-email.server.ts` | link da proposta no e-mail |
| `src/lib/propostas.functions.ts` | link da proposta (WhatsApp) |
| `src/lib/email-templates/proposta.tsx` | valor padrão e exemplo do modelo de e-mail |
| `src/lib/xerife/notify.server.ts` | link do lead no Telegram |
| `src/lib/xerife/watchdog-conversa.server.ts` | link da conversa no Telegram |
| `src/lib/whatsapp-inbound.server.ts` | link da conversa no aviso |
| `src/routes/api/public/hooks/ia-handoff.ts` | link da conversa |
| `src/routes/api/public/hooks/ia-urgente.ts` | link da conversa |
| `src/routes/api/public/hooks/xerife-fechamento.ts` | "crm.inplastic.com.br/equipe" |
| `src/lib/invites.functions.ts` | passa a reusar o helper em vez de ter a lista própria |

**`APP_PUBLIC_URL` continua `https://crm.inplastic.com.br`.** Nada muda de comportamento nesta etapa — é só troca de origem do valor. Testes novos garantem: valor válido é usado; valor não permitido cai no endereço atual; o helper monta o caminho certo.

Materiais estáticos (`public/manual.html`, `public/apresentacao.html`, `LEADS_API.md`, `HANDOVER.md`) ficam para depois da virada.

## 2. Liberar o endereço novo na entrada, sem tirar os antigos

- Incluir `https://crm.aginext.com.br` na lista de endereços de retorno permitidos da autenticação, mantendo `crm.inplastic.com.br`, `crm-inplastic.lovable.app` e o endereço de desenvolvimento.
- Incluir o mesmo endereço na lista do helper (item 1).

Isso só autoriza — não passa a usar. Convites continuam saindo com o endereço atual.

## 3. Tirar WhatsApp e Telegram do domínio (item crítico)

Motivo: quando `crm.aginext.com.br` virar o principal, `crm.inplastic.com.br` passa a redirecionar. Meta e Telegram **não seguem redirecionamento** — as mensagens de cliente parariam de chegar. Os dois passam a entregar no endereço técnico permanente `https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app`, que não depende de domínio nenhum e já é usado por 8 dos 9 agendamentos.

Cada troca segue o mesmo rito: **provar antes → trocar → provar depois → guardar o comando de volta**.

### 3.1 Telegram (primeiro, risco menor)
1. Ler a configuração atual (`getWebhookInfo`) e registrar por escrito a URL atual e se existe token de verificação.
2. Provar que o endereço técnico responde na rota do Telegram.
3. `setWebhook` para o endereço técnico, **reaproveitando o mesmo token de verificação** e as mesmas categorias de atualização.
4. Conferir com `getWebhookInfo` e esperar uma mensagem real chegar (contador de pendências zerado, sem erro registrado).
5. Volta: `setWebhook` com a URL anterior e o mesmo token — comando escrito no relatório final.

### 3.2 WhatsApp / Meta (só depois do Telegram fechado)
1. Ler a configuração atual do aplicativo na Meta: URL de retorno, token de verificação e campos assinados. Registrar tudo.
2. **Prova prévia obrigatória:** chamar o endereço técnico com o handshake de verificação da Meta e confirmar que devolve o desafio esperado. Se não devolver exatamente isso, a troca não acontece.
3. Trocar a URL de retorno para o endereço técnico, com o mesmo token de verificação e os mesmos campos assinados.
4. Confirmar que a Meta aceitou e que os campos continuam assinados.
5. **Prova real:** mandar uma mensagem de teste de um número real e confirmar que ela aparece nas conversas do CRM. Enquanto essa prova não vier, o item não é considerado concluído.
6. Volta: a chamada exata para restaurar a URL anterior com o mesmo token — escrita no relatório e testada mentalmente antes da troca.

Janela sugerida: fora do horário comercial, porque entre a troca e a confirmação existem alguns segundos em que uma mensagem pode ficar pendente (a Meta reentrega).

## 4. Agendamento fora do padrão

`xerife-pedidos-hourly` ainda chama `crm-inplastic.lovable.app`. Passar para o endereço técnico, igual aos outros oito. Conferir depois que a próxima execução saiu com sucesso.

## 5. A virada (só quando o Denis avisar)

Quando `crm.aginext.com.br` abrir o CRM com certificado válido:
- `APP_PUBLIC_URL` passa a `https://crm.aginext.com.br` (um valor só, graças ao item 1);
- atualizar os materiais estáticos (manual, apresentação, documentos);
- conferir um convite novo, um link de proposta novo e um aviso do Telegram.

O endereço antigo continua funcionando e passa a redirecionar para o novo.

---

## Detalhes técnicos

- Helper novo: `src/lib/app-url.server.ts`, exportando `appBaseUrl()`, `appUrl(path)`, `appHost()`; lista permitida `crm.inplastic.com.br`, `crm.aginext.com.br`, `crm-inplastic.lovable.app`, `http://localhost:8080`. `invites.functions.ts` remove `URLS_PERMITIDAS`/`appBaseUrl` locais e reexporta pelo helper, preservando `__test__` usado em `seguranca-p0.test.ts`.
- Regra mantida: base nunca vem de `Host`/`Origin`/`Referer`.
- Endereço técnico: `https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app`; rotas `/api/public/hooks/whatsapp-cloud` e `/api/public/telegram/webhook`.
- Telegram via gateway do conector (`setWebhook`/`getWebhookInfo`), preservando `secret_token` e `allowed_updates`.
- Meta: atualizar `callback_url` do campo de assinatura, preservando `verify_token` e as assinaturas já ativas; validar antes com `hub.mode=subscribe&hub.challenge=...`.
- Sem migração de banco: nenhuma tabela guarda endereço do app.
- Fechamento: `bunx tsgo --noEmit`, `bunx vitest run`, `bun run build` com saída real colada; nada publicado.

## Fora do escopo

Marca e identidade visual, remetente de e-mail (`notify.inplastic.com.br`), conexão do domínio e DNS (Denis faz no painel), e qualquer troca de valor de `APP_PUBLIC_URL` nesta etapa.
