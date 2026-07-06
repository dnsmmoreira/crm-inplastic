## Etapa 1 — Fundação de dados (migração única)

Cria todas as tabelas por vendedor e globais, com RLS + GRANTs, seed dos cadastros globais e substitui o store local.

**Tabelas (owner_id uuid, nullable em `leads`):**
- `leads` — colunas do plano original + `origem text`, `telefone_whatsapp text` (dígitos com DDI 55), `external_id text`, `last_interaction_at timestamptz`, `created_at`, `updated_at`. Etapa restrita ao enum canônico: `atendimento | novo | qualificacao | proposta | negociacao | ganho | perdido`.
- `lead_interactions`, `lead_ai_actions`, `tarefas`, `propostas`, `proposta_itens`, `proposta_parcelas`, `pedidos`, `pedido_itens`.
- Globais: `produtos`, `condicoes_pagamento`, `emitters`.
- Trigger em `lead_interactions` e mensagens WhatsApp → atualiza `leads.last_interaction_at`.

**RLS:**
- Vendedor: `owner_id = auth.uid()`. Admin: tudo. Lead com `owner_id IS NULL`: só admin vê.
- Globais: `SELECT` para authenticated, `INSERT/UPDATE/DELETE` só admin (`has_role`).
- `service_role` com acesso total (n8n).

**Padronização de etapas:** troco `em_atendimento` → `atendimento` em `src/lib/mcp/tools/*` e em todo o front.

**Seed:** produtos, condições e emitters dos dados hoje hardcoded em `crm-store.ts`. Base de leads/propostas/pedidos começa vazia.

**Código:**
- Novos módulos `src/lib/leads.functions.ts`, `tarefas.functions.ts`, `propostas.functions.ts`, `pedidos.functions.ts`, `catalogo.functions.ts` — todos com `requireSupabaseAuth`.
- Hooks TanStack Query em `src/hooks/use-*.ts` substituindo `useCrm(...)`.
- Remoção de `src/lib/crm-store.ts` e `crm-sync.ts` após migrar todas as telas: `pipeline`, `contatos`, `tarefas`, `propostas.index`, `propostas.$id`, `produtos`, `condicoes-comerciais`, `empresas`, `index` (dashboard), `agente-ia`, `canais`, `LeadDrawer`.
- Layout, cores e textos permanecem idênticos.

## Etapa 2 — Canais com Z-API real

- Tabelas novas de conversa (ver Etapa 5) alimentam a tela. `zapi_inbox` continua como log bruto; o webhook passa a fazer upsert em `whatsapp_conversas` e insert em `whatsapp_mensagens (autor='cliente')` além do log.
- Tela `/canais` reescrita: **conversas agrupadas por telefone** via Supabase Realtime (fallback polling 5s), transcript completo incluindo mensagens antigas.
- Remove: botão "Simular msg", switch "Simular fluxo real", `RANDOM_MSGS`, autoCapture no navegador.
- Se `phone` = `leads.telefone_whatsapp` → mostra chip do lead. Senão → botão "Criar lead a partir desta conversa" (pré-preenche nome, telefone, `origem='whatsapp'`).
- Envio manual pela tela usa `sendWhatsapp` existente e grava com `autor='vendedor'`.
- Card Z-API (webhook URL + testar conexão) permanece.

## Etapa 3 — Xerife (cron determinístico)

**3a. Edge Function `xerife`:**
- Roda hora a hora 07h-20h America/Sao_Paulo via `pg_cron` + `pg_net`.
- Porta a lógica de `TemperatureLevel` e `FollowupLevel` de `crm-store.ts` para `supabase/functions/xerife/index.ts` (fonte única).
- Varre leads ativos (`atendimento` → `negociacao`), tarefas e propostas.

**3b. Regras (configuráveis):**
- Nova tabela `xerife_config` (singleton, editável por admin): `dias_sem_interacao_por_etapa jsonb` (default `{novo:1, qualificacao:2, proposta:3, negociacao:2}`), `proposta_enviada_dias int` (3), `tarefa_atrasada_horas int` (24), `ia_sem_resposta_horas int` (2), `resumo_diario_ativo bool`, `resumo_hora time` (08:00), `horario_comercial_inicio time`, `horario_comercial_fim time`.
- Cria tarefa automática de follow-up para o `owner_id` (idempotente: não cria se já houver tarefa aberta do mesmo tipo no lead).
- Toda ação → `lead_ai_actions (tipo, lead_id, descricao, criado_em)`.

**3c. Notificações Z-API (só equipe interna, nunca para o cliente):**
- Adiciono `profiles.telefone_whatsapp text`.
- 08h: resumo diário por vendedor + consolidado ao admin.
- Alertas urgentes fora do resumo: máx 1 por lead por dia (dedupe em `lead_ai_actions`).

**3d. Tela Agente IA vira "Painel do Xerife":**
- Feed de `lead_ai_actions` (filtros lead/vendedor/período), painel por temperatura, formulário de configuração das regras (só admin).
- Remove dados demo atuais da rota `/agente-ia`.

## Etapa 4 — Entrada externa (n8n direto no banco)

- Sem endpoint novo. RLS já libera `service_role` para insert em `leads`, `lead_interactions`, `lead_ai_actions` com `owner_id` nulo.
- Novo arquivo `LEADS_API.md` na raiz: schema exato, valores de etapa canônicos, payloads JSON de exemplo para leads/interações e (adicionado na Etapa 5) mensagens IA + chamada de `atribuir_proximo_vendedor`.

## Etapa 5 — Atendimento IA com handoff sequencial

**5a. Tabelas:**
- `whatsapp_conversas (id, phone unique, lead_id fk nullable, status enum('ia_atendendo','humano_atendendo','qualificado','encerrado'), ia_ativa bool default true, created_at, updated_at)`.
- `whatsapp_mensagens (id, conversa_id fk, direcao enum('entrada','saida'), autor enum('cliente','ia','vendedor'), conteudo text, created_at)`.
- Realtime habilitado nas duas. `service_role` com escrita liberada.
- RLS: admin vê tudo; vendedor vê conversas de leads onde `owner_id = auth.uid()`.

**5b. Round-robin:**
- `fila_vendedores (user_id fk profiles, posicao int, ativo bool)` editável na tela Usuários (só admin).
- Função `atribuir_proximo_vendedor(lead_id uuid) returns uuid` — SECURITY DEFINER, rotação circular persistente. Ao atribuir: seta `leads.owner_id`, `leads.etapa='qualificacao'`, `whatsapp_conversas.status='qualificado'`, `ia_ativa=false`.

**5c. Nova tela `/atendimento-ia` (só admin no menu):**
- Lista de conversas ativas via Realtime, status colorido, preview da última msg, contador desde a última resposta.
- Clique abre transcript ao vivo (cliente/IA/vendedor visualmente distintos).
- Botão "Assumir conversa" (admin ou dono): seta `ia_ativa=false`, `status='humano_atendendo'`; libera composer que envia via `sendWhatsapp` e grava mensagem com `autor='vendedor'`.
- Vendedores acessam a mesma tela mas veem só conversas de leads deles (RLS).

**5d. Documentação n8n:** anexado ao `LEADS_API.md` — esquema das conversas/mensagens, INSERT de mensagem IA, chamada de `atribuir_proximo_vendedor`, e a regra de ouro: n8n só responde se `ia_ativa=true`.

## Etapa 6 — Verificação

Smoke test manual descrito na spec (admin vs vendedor, lead sem dono, mensagem Z-API criando conversa em tempo real, assumir conversa, round-robin, xerife gerando tarefa+action, impressão de proposta). Sem publish automático. Ao final, listo concluído e pendente.

## Detalhes técnicos

- **Migrações separadas por etapa** (4 no total) para revisão incremental: 1) schema base + globais + seed, 2) conversas WhatsApp + realtime, 3) xerife_config + fila_vendedores + função round-robin, 4) `profiles.telefone_whatsapp` e cron.
- **Cron via `pg_cron` + `pg_net`** chamando a Edge Function `xerife` com `apikey` do anon; guarda de horário/timezone dentro da função.
- **Realtime** habilitado com `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
- **Migração de código sem quebrar visual**: substituo `useCrm` por hooks um por tela, mantendo props/tipos equivalentes; `crm-store.ts` só é deletado quando nenhuma tela mais importa.
- **Tipos**: `src/integrations/supabase/types.ts` regenera automaticamente após cada migração.

## Confirmações antes de executar

1. Perfis de usuários existentes: reaproveito `profiles` (adiciono `telefone_whatsapp`). OK?
2. Zerar base de leads (nenhum lead real cadastrado hoje, os atuais são teste). OK?
3. Edge Function `xerife` chamando Z-API direto (usa os secrets já configurados `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`). OK?
4. Rota nova `/atendimento-ia` no menu lateral (posição sugerida: logo abaixo de "Canais de Entrada", ícone Radio, só admin). OK?
