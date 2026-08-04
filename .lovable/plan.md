# Watchdog de conversa parada na IA

Objetivo: nenhuma conversa em `ia_atendendo` fica horas parada sem virar lead atribuído a um vendedor.

## BLOCO 1 — Gatilho

**Como os crons existem hoje** (registrados no banco, em `cron.job`, não em arquivo do repo):

| jobid | jobname | schedule | endpoint |
|---|---|---|---|
| 2 | xerife-hourly | `0 10-23 * * *` | `/api/public/hooks/xerife` |
| 3 | xerife-digest-daily | `0 11 * * *` | `/api/public/hooks/xerife?mode=digest` |
| 4 | xerife-engine-15min | `*/15 10-23 * * 1-5` | `/api/public/hooks/xerife-engine` |
| 5 | xerife-agenda-diaria | `30 10 * * 1-5` | `/api/public/hooks/xerife-agenda-diaria` |
| 6 | xerife-checkpoint | `0 16 * * 1-5` | `/api/public/hooks/xerife-checkpoint` |
| 7 | xerife-fechamento | `0 21 * * 1-5` | `/api/public/hooks/xerife-fechamento` |

Recomendação: **cron novo dedicado** (`xerife-watchdog-conversa`, `*/10 10-23 * * 1-5`), chamando um endpoint novo `/api/public/hooks/xerife-watchdog-conversa`, no mesmo padrão de auth do engine (`xerife-engine.ts:663-676`: header `x-xerife-secret` OU `apikey` = publishable key). Motivo: acrescentar a regra dentro de `runEngine` obrigaria a editar `xerife-engine.ts` (arquivo de 690 linhas com 10+ regras já validadas) e amarraria a janela do watchdog aos 15min do engine. Um `cron.schedule('xerife-watchdog-conversa', ...)` novo não toca nenhum job existente — `cron.schedule` só cria/atualiza pelo `jobname`.

**Query de detecção** (via `supabaseAdmin`, ignora RLS):

```
whatsapp_conversas
WHERE status = 'ia_atendendo'
  AND ia_ativa = true
  AND lead_id IS NULL
  AND requer_humano = false
  AND coalesce(last_message_at, created_at) < :threshold
ORDER BY coalesce(last_message_at, created_at) ASC
LIMIT 50
```

`:threshold` calculado em **minutos úteis** com `subtractBusinessMinutes(...)` (`src/lib/xerife/businessTime.server.ts:95`), igual à regra de lead órfão (`xerife-engine.ts:242`).

**Campo de config:** nenhum dos dois existentes serve bem. `ia_sem_resposta_horas` (=2) hoje mede "IA falou e o cliente sumiu"; `sla_lead_orfao_min` (=15) mede "lead já criado sem dono" e é consumido em `xerife-engine.ts:242-285`. Reusar qualquer um acopla duas regras diferentes ao mesmo número. Proposta: **campo novo** em `xerife_config`, `watchdog_conversa_ia_min` (default 30, migration aditiva com `ADD COLUMN IF NOT EXISTS`), mais um `watchdog_conversa_ativo boolean default false` para ligar só quando quisermos.

## BLOCO 2 — Ação ao detectar

Sequência recomendada, por conversa:

**(a) Criar o lead — reusar a lógica do `ia-qualificar`, não o `createLeadFromConversa`.**
`createLeadFromConversa` (`src/lib/canais.functions.ts:61`) é `createServerFn` com `requireSupabaseAuth` e define `owner_id = userId` (linha 93) — não existe usuário logado num cron, e ele já grava dono errado. O caminho certo é o do webhook n8n (`ia-qualificar.ts:79-125`): insert em `leads` com `owner_id: null`, `stage: 'novo'`, `origem: 'whatsapp'`, `source` (usar `"WhatsApp Watchdog"`), tags, `notes` com a última mensagem. Para não duplicar código, extrair esse trecho para um helper server-only novo (`src/lib/xerife/watchdog-conversa.server.ts`) — ou deixá-lo autocontido no watchdog e só depois considerar unificação, se o objetivo for zero linhas tocadas em `ia-qualificar.ts`.

**(b) Round-robin.** RPC `public.atribuir_proximo_vendedor(_lead_id uuid)` (SECURITY DEFINER), chamada em `ia-qualificar.ts:141`. O que faz: trava a linha do lead (`FOR UPDATE`); se `owner_id` já existe, retorna sem escrever nada; trava `fila_estado`, escolhe o próximo `fila_vendedores` com `ativo = true` e `posicao >` a do último, com fallback para a primeira posição ativa; se não houver ninguém ativo, `RAISE EXCEPTION 'Nenhum vendedor ativo na fila'`; atualiza `fila_estado.ultimo_user_id`; move `stage` para `qualificacao` só se estava em `novo`/`atendimento`; e nesse caso já faz `UPDATE whatsapp_conversas SET status='qualificado', ia_ativa=false WHERE lead_id = _lead_id`.
**Ela não olha `limite_leads_simultaneos`** — esse campo só é lido/escrito na tela de usuários (`src/lib/usuarios.functions.ts:174,457`). O watchdog **consome** a RPC como está; respeitar o limite exigiria alterar a RPC, o que fica fora deste escopo.

**(c) Desligar a IA.** Já é efeito colateral da própria RPC (passo 5 acima), porque o lead nasce em `novo`. O watchdog só precisa de um `UPDATE` defensivo (`lead_id`, e `ia_ativa=false`/`status`) para o caso de a RPC falhar — ver Bloco 5(a).

**(d) Notificar o vendedor.** Reusar `notifyOwner(ownerId, msg)` (`src/lib/xerife/notify.server.ts:121`) — ele resolve telefone e `telegram_chat_id` do perfil e chama `enviarNotificacaoInterna`, que hoje dá precedência ao Telegram (`notify.server.ts:60-83`) porque `xerife_config.telegram_ativo = true`. Zero mudança nesse arquivo. Mensagem com `crmLeadLink(leadId)` (`notify.server.ts:154`).

## BLOCO 3 — Não conflitar com o n8n

Se o watchdog agir primeiro e o n8n chamar `ia-qualificar` depois:

- `ia-qualificar.ts:76-79` lê `conv.lead_id` e **só cria lead se estiver nulo** (`if (!leadId)`). Como o watchdog já gravou `lead_id`, o insert é pulado. **Sem lead duplicado.**
- `ia-qualificar.ts:128-136` reaplica `status='qualificado'`, `ia_ativa=false` — idempotente.
- Se vier com `distribuir: true`, a RPC (`:141`) retorna o `owner_id` já existente sem escrever nem consumir posição da fila (guarda de proprietário). **A fila não anda duas vezes.**
- Único efeito colateral: mais uma linha em `lead_ai_actions` (`:159` / `:173`) — registro de auditoria, aceitável.

Idempotência do próprio watchdog, com o que já existe:
1. A query filtra `lead_id IS NULL`, então a conversa sai do conjunto assim que é tratada.
2. `alreadyActed(sb, 'watchdog_conversa_ia', leadId|null, 24)` e `logAction(...)` de `src/lib/xerife/dedupe.server.ts:14,45` — como não há lead antes da ação, o dedupe usa a **conversa** como chave: gravar em `xerife_log` com `regra='watchdog_conversa_ia'` e `payload.conversa_id`, e checar por esse payload (ou gravar o `lead_id` depois de criado e confiar no filtro 1 + janela).
3. Ordem transacional prática: criar lead → gravar `lead_id` na conversa → chamar RPC → logar. Se o processo morrer no meio, a rodada seguinte vê `lead_id` preenchido e não recria; o lead sem dono é então coberto pela regra de lead órfão já existente (`xerife-engine.ts:242-285`).

## BLOCO 4 — Impacto / escopo congelado

**Criados**
- `src/routes/api/public/hooks/xerife-watchdog-conversa.ts` — endpoint + `runWatchdogConversa({force, dryRun})`.
- (opcional) `src/lib/xerife/watchdog-conversa.server.ts` — se preferirmos separar a lógica do handler.
- Migration aditiva: `ALTER TABLE public.xerife_config ADD COLUMN IF NOT EXISTS watchdog_conversa_ativo boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS watchdog_conversa_ia_min integer NOT NULL DEFAULT 30;`
- Registro do cron novo (`cron.schedule('xerife-watchdog-conversa', ...)`), via operação de dados, não migration.

**Tocados (mínimo, todos aditivos)**
- `src/lib/xerife.functions.ts` — acrescentar `runWatchdogConversaNow` / `simulateWatchdogConversa` (admin-only), no mesmo padrão das linhas 188-248. Só inserções ao fim do arquivo.
- Opcionalmente `src/components/xerife/XerifeConfigForm.tsx` + o schema em `src/lib/xerife/../xerife.functions.ts:36-117` — para expor o toggle e a janela na tela. Se ficar de fora desta fase, os campos só mudam por SQL.

**Confirmado sem alterar:** placar, `estimated_value`, leads existentes (o watchdog só faz INSERT de leads novos), ordem da fila (só consome a RPC, que já é quem avança `fila_estado`), `src/routes/api/public/zapi/webhook.ts`, canal comercial (`canais.functions.ts`, `zapi.functions.ts`, `ia-responder.ts`), Telegram (webhook/vínculo/secrets — só chamamos `notifyOwner`), e as rotinas atuais do Xerife (`xerife.ts`, `xerife-engine.ts`, `xerife-agenda-diaria.ts`, `xerife-checkpoint.ts`, `xerife-fechamento.ts`, `xerife-pedidos.ts` intactos).

Único arquivo existente que precisa encostar de fato é `src/lib/xerife.functions.ts`, e apenas por inserção no fim, para dar ao admin um botão "rodar agora / simular" coerente com as outras rotinas. Se quiser escopo ainda mais fechado, dá para pular isso e testar só via cron/curl.

## BLOCO 5 — Casos de borda

**(a) Sem fila / sem vendedor ativo.** A RPC lança `Nenhum vendedor ativo na fila`. O watchdog captura o erro, **mantém o lead criado sem dono**, grava `xerife_log` com `acao='lead criado sem vendedor'` e dispara `notifyDiretoria` (`notify.server.ts:135`). O lead então cai naturalmente na regra de lead órfão existente. Nunca deixar a exceção derrubar o loop — try/catch por conversa.

**(b) Mídia com `requer_humano=true`, `ia_ativa=false`.** Fora do conjunto: o filtro exige `ia_ativa = true`, e adicionamos `requer_humano = false` explicitamente. Essa conversa já foi entregue ao humano por decisão do webhook; tratá-la aqui seria sequestrar um atendimento em curso. Se quisermos cobrir depois, vira uma segunda regra separada (alerta, não criação automática de lead).

**(c) Horário comercial.** Sim, respeita. `isBusinessNow(win)` (`businessTime.server.ts:52`) com a janela de `xerife_config.horario_comercial_inicio/fim` (mesmo padrão de `xerife-engine.ts:158`), e o cron já limita `* * 1-5`. Fora da janela, retorna `{ ran: false }` sem agir — exceto com `?force=1`. O threshold usa minutos **úteis**, então conversa que chegou às 19h50 não é considerada parada às 8h do dia seguinte por "12 horas de silêncio".

**(d) Loop a cada rodada.** Três travas: (1) `lead_id IS NULL` remove a conversa do conjunto após a primeira ação; (2) `alreadyActed(..., 'watchdog_conversa_ia', ..., 24h)` de `dedupe.server.ts:14`; (3) `LIMIT 50` por rodada, para o backlog inicial não virar uma rajada de notificações. Modo `dryRun` retorna o plano sem escrever, para conferirmos o alcance antes de ligar.
