# Xerife 2.0 — Motor de Cadência

Evolução (não substituição) do Xerife atual: mantém o hook `/api/public/hooks/xerife`, o `xerife_config`, o resumo diário e o painel `/agente-ia`. Amplia dados, regras, agenda, notificações e UI.

## Escopo por fases (entregas incrementais, cada fase é uma migração + código)

### Fase 1 — Fundação de dados (migração única)

**1a. Estender `tarefas`:**
- Adicionar `cliente_id uuid` (nullable, refs `leads` — hoje não há tabela separada de clientes; leads em stage `ganho` são "clientes"). Se preferir manter só `lead_id`, uso `lead_id` e um flag `is_cliente` derivado do `stage`. **Confirmar abaixo.**
- Novos campos: `tipo text` (enum abaixo), `descricao text`, `prioridade int default 3`, `hora_sugerida time`, `status text default 'pendente'` (pendente/concluida/adiada), `origem text default 'manual'` (xerife/manual), `nota_conclusao text`, `escalonamentos int default 0`, `concluida_at timestamptz`, `motivo_adiamento text`.
- Manter `done`/`due_date`/`kind`/`title` (sincronizados via trigger: `done=true` ⇔ `status='concluida'`; `title`↔`titulo`; `kind`↔`tipo`) para não quebrar telas atuais.
- Enum `tarefa_tipo`: `follow_up, primeiro_contato, resposta_pendente, cadencia_proposta, pos_venda_confirmacao, pos_venda_satisfacao, pos_venda_recompra, resgate_carteira, reativacao_lead, prospeccao`.
- Trigger: bloqueia `DELETE` em tarefas com `origem='xerife' AND tipo LIKE 'pos_venda_%'`; bloqueia `UPDATE status='concluida'` sem `nota_conclusao` para essas mesmas.

**1b. Campos em `leads`:**
- `etapa_changed_at timestamptz` + trigger que atualiza no `UPDATE OF stage`.
- `last_contact_at timestamptz` + trigger em: `lead_interactions INSERT`, `whatsapp_mensagens INSERT WHERE autor='vendedor'`, `tarefas UPDATE status→concluida`.
- `ultima_msg_cliente_at`, `ultima_msg_vendedor_at` via trigger em `whatsapp_mensagens`.
- `proposta_enviada_at` via trigger no `UPDATE OF stage → 'proposta'`.
- `esfriando bool default false`.

**1c. `xerife_config` — adicionar colunas:**
`sla_primeiro_contato_min` (15), `sla_primeiro_contato_escalar_min` (60), `sla_resposta_whatsapp_horas` (2), `sla_resposta_whatsapp_escalar_horas` (4), `max_dias_etapa jsonb` (novo=1, qualificacao=2, proposta=3, negociacao=5), `cadencia_proposta_dias int[]` ([2,5,10,15]), `carteira_alerta_dias` (45), `carteira_critico_dias` (60), `reciclagem_perdidos_dias` (90), `pos_venda_dias int[]` ([3,15,45]), `meta_atividades_dia` (15), `dias_uteis_inicio time` (08:00), `dias_uteis_fim time` (18:00).

**1d. Nova tabela `xerife_log`:**
`id, regra text, lead_id, cliente_id, vendedor_id, acao_tomada text, payload jsonb, created_at`. Índice `(regra, lead_id, created_at)`. Usado para idempotência (dedupe 24h) e auditoria.

Todas as tabelas novas: GRANT authenticated + service_role; RLS por owner/admin.

### Fase 2 — Engine `xerife-engine` (a cada 15min, 07–20h SP)

Reescrever `runXerife` em `src/routes/api/public/hooks/xerife.ts` mantendo o endpoint atual. Cron pg_cron: `*/15 7-20 * * 1-5` (dias úteis).

Helpers em `src/lib/xerife/*.server.ts`:
- `businessTime.ts` — cálculo de minutos/horas úteis SP (seg-sex, janela config).
- `dedupe.ts` — checa `xerife_log` últimas 24h + tarefa pendente equivalente.
- `notify.ts` — Z-API para vendedor (via `profiles.telefone_whatsapp`) e diretoria (`WHATSAPP_DIRETORIA`).
- `rules/` — um arquivo por bloco:
  - `a1-primeiro-contato.ts`, `a2-lead-parado.ts`, `a3-sem-resposta.ts`, `a4-cadencia-proposta.ts`
  - `b1-carteira-45.ts`, `b2-carteira-60.ts`, `b3-reciclagem-perdidos.ts`
  - `c-pos-venda.ts` (gera as 3 tarefas quando `stage → ganho`)
  - Cada regra: query alvo → dedupe → cria tarefa/alerta → log.

### Fase 3 — Agenda full-time (3 novos endpoints públicos + cron)

Rotas em `src/routes/api/public/hooks/`:
- `xerife-agenda-diaria.ts` (07:30 SP dias úteis) — para cada vendedor: ordena pendentes por (escalonamento desc, prioridade asc, tipo weight), completa até `meta_atividades_dia` puxando `resgate_carteira`/`reativacao_lead` mais antigas com `data_prevista` no futuro (antecipa para hoje). Envia lista numerada via Z-API.
- `xerife-checkpoint.ts` (13:00 SP) — resumo do que ainda está pendente hoje.
- `xerife-fechamento.ts` (18:00 SP) — rola pendentes para amanhã (`prioridade -=1`, `escalonamentos +=1`), envia placar ao vendedor e ao Denis.
- Estender `runResumoDiario` existente (08h) com: ranking vendedores, tempo médio 1ª resposta, SLAs abertos, esfriando, carteira 60d+.

pg_cron novos jobs chamando cada endpoint com `apikey` do anon.

### Fase 4 — UI

- **Nova rota `/minha-agenda`** (visível a todos os vendedores; menu lateral abaixo de "Tarefas"):
  - Lista tarefas de hoje ordenadas por prioridade, chip de tipo, motivo (`descricao`).
  - Botão **Concluir** → modal com campo `nota_conclusao` (obrigatório para pós-venda).
  - Botão **Adiar** → modal com motivo + nova data; incrementa `escalonamentos`.
  - Ao concluir, atualiza `leads.last_contact_at` (trigger cuida).
- **Badge dias-sem-contato** nos cards de lead (`pipeline`, `contatos`, `LeadDrawer`): verde <30, amarelo 30-45, laranja 45-60, vermelho 60+.
- **Painel gestor** — nova aba em `/agente-ia` "Cadência": SLAs estourados abertos, tarefas pendentes por vendedor, carteira em risco, esfriando. Só admin.
- **Config admin** — estender formulário atual de `xerife_config` com os novos campos (agrupados: SLAs / Cadência / Carteira / Pós-venda / Agenda).

### Fase 5 — Compatibilidade e testes

- Página `/tarefas` atual continua funcionando (usa `title/due_date/done`).
- Server fns `tarefas.functions.ts` ganham `concluirTarefa({id, nota})` e `adiarTarefa({id, motivo, nova_data})`.
- Backfill único (migração ou insert): setar `etapa_changed_at = updated_at`, `last_contact_at = last_interaction_at`, `proposta_enviada_at` para leads em stage `proposta`.

## Detalhes técnicos

- Timezone SP: usar `AT TIME ZONE 'America/Sao_Paulo'` no SQL; helper JS com `Intl.DateTimeFormat`.
- Idempotência: toda regra grava em `xerife_log` com chave lógica `(regra, lead_id, janela)`; antes de agir, `SELECT ... WHERE created_at > now() - interval '24h'`.
- Fluxo Lucas preservado: pular leads com `whatsapp_conversas.ia_ativa=true` nas regras A1/A3.
- Omie: gatilho de pós-venda dispara junto ao mesmo evento que hoje gera pedido (não altero Omie).
- Z-API: reuso `sendZapiText` de `src/lib/zapi-send.server.ts`; templates curtos com link `https://crm.inplastic.com.br/pipeline?lead={id}`.
- Todos os cron jobs via `pg_cron`+`pg_net` chamando `/api/public/hooks/*` com header `apikey`.

## Confirmações antes de executar

1. **Modelo "cliente"**: hoje não existe tabela `clientes` — leads em `stage='ganho'` são clientes. Uso `lead_id` em tarefas com um filtro por stage, OK? (Alternativa: criar `clientes` separada — maior refactor.)
2. **Rota `/minha-agenda`** no menu abaixo de "Tarefas", visível a todos. OK?
3. **Cron a cada 15min** só em dias úteis 07-20h — OK reduzir custo assim vs. 24/7?
4. **Pós-venda D+3/15/45**: gatilho no `UPDATE stage → 'ganho'` (trigger no banco), não depende de pedido no Omie. OK?
