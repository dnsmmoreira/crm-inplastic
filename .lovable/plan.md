# Diagnóstico: por que o "Lucas" para de responder no meio da conversa

Investigação somente-leitura (código + banco). Abaixo o que foi confirmado e a causa raiz.

## 1. Onde está o prompt/persona do Lucas

Não está neste projeto. Não existe **nenhuma** chamada a modelo de IA no código do CRM (nenhum OpenAI, Gemini, Anthropic ou Lovable AI Gateway). O nome "Lucas" aparece apenas em comentários (`src/routes/api/public/hooks/xerife-engine.ts:14` e `:411`).

O cérebro do Lucas roda **fora**, no n8n. O CRM só faz três coisas:
- recebe a mensagem do cliente pela Z-API (`src/routes/api/public/zapi/webhook.ts`);
- avisa o n8n com o histórico das últimas 20 mensagens;
- expõe endpoints que o n8n chama de volta: `ia-responder` (responder), `ia-qualificar` (qualificar), `ia-urgente` (alertar diretoria).

Consequência prática: o texto da persona e as regras de conversa não podem ser ajustados aqui — só no fluxo do n8n.

## 2. O que decide se a IA continua ou para

O webhook só encaminha ao n8n quando a conversa está com `ia_ativa = true` **e** `status = 'ia_atendendo'` (`webhook.ts:215`). Fora disso, a mensagem é gravada e ninguém responde.

O que desliga a IA:
- **Qualificação** — `ia-qualificar.ts:128-136` grava `ia_ativa = false` e `status = 'qualificado'`.
- **Mídia/áudio/documento** — o webhook marca `requer_humano = true` e desliga a IA (`webhook.ts:170-184`), sem avisar o n8n.
- **Atribuição a vendedor** — a função `atribuir_proximo_vendedor` no banco desliga a IA.
- **Humano assume** pela tela (`atendimento.functions.ts`, `canais.functions.ts`).

Além disso, o aviso ao n8n tem timeout de 3s e **não tem retry** (`webhook.ts:229-249`): se o n8n demorar ou falhar, aquela mensagem simplesmente não é respondida, e nada reenvia.

## 3. Logs de erro

Não há registro de erro de modelo de IA no banco — porque o CRM não chama modelo nenhum. Os erros ficam nos logs do servidor (`[n8n-notify] failed`) e, principalmente, no histórico de execuções do n8n. A tabela `zapi_inbox` guarda 103 payloads brutos recebidos desde 06/07 (o campo `processed` nunca é atualizado — é só auditoria, não é uma fila travada).

## 4. Padrão nas conversas paradas — a causa raiz

Das 19 conversas com `status = 'ia_atendendo'`, **18 têm a IA como último autor**. Ou seja: o Lucas respondeu e o **cliente** é que não voltou. Essas não são travamento — são conversas frias esperando follow-up. (Todas são de 31/07, com carimbos idênticos, indicando importação em lote.)

O travamento real está em outro grupo, e o padrão é consistente:

| Conversa | Status | ia_ativa | Último autor | Responsável |
|---|---|---|---|---|
| Jhow Reis (06/08) | qualificado | false | cliente | ninguém |
| Luiz Nunes (03/08) | qualificado | false | cliente | ninguém |
| Eidson Alves (03/08) | qualificado | false | cliente | vendedor |
| Liliane Santos (04/08) | ia_atendendo | false | cliente | vendedor (pediu humano) |

**Causa raiz:** o Lucas faz uma pergunta e, ao mesmo tempo, dispara a qualificação. A qualificação desliga a IA. O cliente responde à pergunta que o próprio Lucas acabou de fazer — e a resposta cai numa conversa com IA desligada, então o webhook não aciona o n8n. Ninguém responde.

Exemplo literal (Jhow Reis, 06/08 06:25): o Lucas escreve *"Já vou te conectar com um consultor... pra qual cidade?"*, o sistema marca `qualificado`/`ia_ativa=false`, o cliente responde *"São Paulo"* — e a conversa morre ali. Pior: essa conversa e a do Luiz ficaram **sem responsável atribuído**, então nem um vendedor recebeu o bastão.

Dois agravantes secundários confirmados:
- Mensagens de mídia derrubam a IA imediatamente e marcam "requer humano" — se ninguém estiver de olho, a conversa para (caso Liliane).
- O watchdog de conversa parada só age em conversas com `ia_ativa = true` e `lead_id IS NULL`, ou seja, **não cobre justamente as conversas qualificadas e órfãs** — que são as que travam.

## Correções propostas (para aprovação)

1. **Não deixar conversa qualificada sem dono.** Quando `ia-qualificar` desligar a IA, garantir que a conversa fique atribuída a um vendedor (round-robin) e gere notificação; se a atribuição falhar, marcar `requer_humano = true` em vez de deixar em silêncio.
2. **Cobrir a lacuna no watchdog.** Ampliar a varredura para incluir conversas em que o último autor é o cliente e a IA está desligada há mais de X minutos úteis, independentemente de `lead_id` e de status — atribuindo/alertando.
3. **Reenfileirar o aviso ao n8n.** Aumentar o timeout e registrar falhas de `[n8n-notify]` em uma tabela, com reprocessamento pelo cron do Xerife, para que uma indisponibilidade momentânea não engula a mensagem.
4. **Handoff de mídia visível.** Notificar o vendedor/admin no momento em que uma mídia derruba a IA, em vez de só marcar a flag.
5. **Ajuste do lado do n8n (fora deste repositório).** O fluxo não deveria chamar `ia-qualificar` na mesma mensagem em que ainda faz uma pergunta ao cliente — qualificar só depois de receber a resposta.

### Detalhes técnicos

- Itens 1, 2 e 4 são mudanças em `src/routes/api/public/hooks/ia-qualificar.ts`, `src/lib/xerife/watchdog-conversa.server.ts` e `src/routes/api/public/zapi/webhook.ts`.
- Item 3 exige uma tabela nova (fila de reenvio) com RLS e GRANTs, além de um passo no cron existente do Xerife.
- Item 5 não é implementável aqui; depende do workflow do n8n.

Nada foi alterado. Diga quais itens quer que eu implemente.
