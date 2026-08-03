# Inventário — Notificação Interna (somente leitura)

Nada foi alterado. Apenas leitura de repositório e banco.

## BLOCO 1 — Pontos de notificação interna

Ponto único: `src/lib/xerife/notify.server.ts:34` (`enviarNotificacaoInterna`).
Dois wrappers: `notifyOwner` (:77) e `notifyDiretoria` (:91).

| # | Arquivo:linha | Evento que dispara | Mensagem (resumo) | Destinatário |
|---|---|---|---|---|
| 1 | `src/routes/api/public/hooks/xerife.ts:132` (via `sendZapiText` :35-36) | Regra de lead urgente do motor Xerife (cron), com dedupe de 24h em `lead_ai_actions` | Alerta curto sobre o lead (`Xerife WhatsApp: <msg>`) | `getOwnerPhone(ownerId)` → dono do lead |
| 2 | `src/routes/api/public/hooks/xerife.ts:396` | Resumo diário, laço de vendedores (`resumo_diario_ativo`, `resumo_hora`) | "Resumo": leads urgentes, tarefas de hoje, tarefas vencidas, propostas paradas | `profiles.telefone_whatsapp` do vendedor (:390) |
| 3 | `src/routes/api/public/hooks/xerife.ts:438` | Resumo diário, laço de admins | Mesmo resumo em visão consolidada + bloco "🏆 Placar do mês" (top 3) | `profiles.telefone_whatsapp` de cada admin (:435) |
| 4 | `src/routes/api/public/hooks/xerife-engine.ts:225` (`alertDiretoria`) | Regras do motor de cadência que escalam para diretoria | Texto da regra (`msg`) + contexto do lead | `notifyDiretoria` → env `WHATSAPP_DIRETORIA` |
| 5 | `src/routes/api/public/hooks/xerife-agenda-diaria.ts:130` | Agenda diária (07:30) | "🤠 Agenda Xerife — data", contagem vs meta, até 20 tarefas com link do lead | `notifyOwner(uid)` → vendedor |
| 6 | `src/routes/api/public/hooks/xerife-checkpoint.ts:61` | Checkpoint 13h | "⏱️ Checkpoint 13h": concluídas, pendentes, críticas (até 5) | `notifyOwner(uid)` → vendedor |
| 7 | `src/routes/api/public/hooks/xerife-fechamento.ts:83` | Fechamento 18h, por vendedor | "🏁 Fechamento do dia": concluídas, roladas | `notifyOwner(uid)` → vendedor |
| 8 | `src/routes/api/public/hooks/xerife-fechamento.ts:148` | Faixa de meta cruzada (50/80/100/120), dedupe 30d em `xerife_log` | "🎯 Meta batida / X% da meta", com valores em R$ | `notifyOwner(r.vendedor_id)` → vendedor |
| 9 | `src/routes/api/public/hooks/xerife-fechamento.ts:183` | Fim do fechamento, se há placar | "🏁 Placar Xerife": total da equipe, ranking por vendedor, top 3, faixas batidas (sem R$) | `notifyDiretoria` → env |
| 10 | `src/routes/api/public/hooks/ia-urgente.ts:155` | POST do n8n em `/api/public/hooks/ia-urgente` (lead urgente fora do horário) | "🔴 LEAD URGENTE": empresa, contato, produto/qtd, urgência, link CRM | `process.env.WHATSAPP_DIRETORIA` (:146) |

Guarda comum: `enviarNotificacaoInterna` lê `xerife_config.whatsapp_interno_ativo` (hoje `false`) e exige `ZAPI_INTERNO_INSTANCE_ID/_TOKEN/_CLIENT_TOKEN`. Hoje, nenhum dos 10 pontos envia de fato.

## BLOCO 2 — Origem do destinatário

- Vendedor/admin: coluna `public.profiles.telefone_whatsapp`, lida em `notify.server.ts:18-28` (`getOwnerPhone`, com cache em memória) e diretamente em `xerife.ts:390` e `:435`.
- Diretoria: variável de ambiente `WHATSAPP_DIRETORIA` — `notify.server.ts:92` e `ia-urgente.ts:146`. Não existe tabela nem coluna de diretoria.
- Credenciais de canal: env `ZAPI_INTERNO_*` (`src/lib/zapi-send.server.ts:35-38`), sem fallback comercial.
- Liga/desliga: `public.xerife_config.whatsapp_interno_ativo` (linha id=1).
- Nenhum número fixo em código.

## BLOCO 3 — Tabela de usuários

`public.profiles` (PK = `auth.users.id`). Colunas: `id`, `name`, `avatar_color`, `created_at`, `updated_at`, `telefone_whatsapp`, `email_cache`, `cargo`, `fuso_horario`, `ativo`, `limite_leads_simultaneos`, `canais_entrada` (text[]), `deleted_at`, `deleted_by`, `ultimo_acesso_em`, `senha_reset_exigido`. Não há coluna de papel.

Papéis em `public.user_roles` (enum `app_role`), contagem atual:
- `vendedor`: 5
- `admin`: 1

Só existem esses dois valores no enum e no banco. Não há noção de diretoria, financeiro ou gestor: `cargo` é texto livre (2 de 6 preenchidos) e não é usado em nenhuma decisão de envio. `public.user_permissions` tem flags booleanas por usuário (`ver_todos_leads`, `gerenciar_usuarios`, etc.), mas nenhuma delas é consultada pelas rotinas de notificação.

## BLOCO 4 — Colunas de contato em `profiles` (6 registros, 6 ativos)

| Coluna | Tipo | Preenchidos |
|---|---|---|
| `telefone_whatsapp` | text NULL | 1 |
| `email_cache` | text NULL | 3 |
| `cargo` | text NULL | 2 |

Não há coluna de telefone fixo nem de e-mail secundário. O e-mail canônico vive em `auth.users`; `email_cache` é cópia.

## BLOCO 5 — `public.xerife_config` (linha id=1)

| Coluna | Tipo | Valor atual |
|---|---|---|
| id | integer | 1 |
| ativo | boolean | true |
| whatsapp_interno_ativo | boolean | false |
| resumo_diario_ativo | boolean | true |
| resumo_hora | time | 08:00:00 |
| horario_comercial_inicio / fim | time | 07:00:00 / 20:00:00 |
| dias_uteis_inicio / fim | time | 08:00:00 / 18:00:00 |
| dias_sem_interacao_por_etapa | jsonb | novo 1, qualificacao 2, proposta 3, negociacao 2 |
| max_dias_etapa | jsonb | novo 1, qualificacao 2, proposta 3, negociacao 5 |
| cadencia_proposta_dias | int[] | {2,5,10,15} |
| proposta_enviada_dias | integer | 3 |
| pos_venda_dias | int[] | {3,15,45} |
| tarefa_atrasada_horas | integer | 24 |
| ia_sem_resposta_horas | integer | 2 |
| sla_primeiro_contato_min / escalar_min | integer | 15 / 60 |
| sla_resposta_whatsapp_horas / escalar_horas | integer | 2 / 4 |
| sla_lead_orfao_min | integer | 15 |
| auto_atribuir_lead_orfao | boolean | true |
| carteira_alerta_dias / critico_dias | integer | 45 / 60 |
| reciclagem_perdidos_dias | integer | 90 |
| meta_atividades_dia | integer | 15 |
| placar_peso_ganho / proposta / tarefa / pos_venda | integer | 10 / 3 / 1 / 2 |
| placar_peso_sla_estourado / carteira_60 | integer | -5 / -3 |
| placar_peso_meta_batida | integer | 20 |
| placar_dias_sem_proposta_limite | integer | 14 |
| updated_at | timestamptz | 2026-07-06 14:42:29+00 |

## BLOCO 6 — Eventos financeiros e de diretoria hoje SEM notificação

Nenhum destes dispara notificação interna hoje:

- Proposta enviada / aprovada / virada em pedido: `src/routes/propostas.$id.tsx:344` (`status: "pedido"`); campos `approval_requested_at`, `approved_at`, `order_created_at` gravados em `src/lib/omie.functions.ts:92`, `:109`, `:110` — sem chamada a `notify*`.
- Negócio ganho: `src/lib/omie.functions.ts:116` e `:145` (`stage: "ganho"`), `src/lib/crm-store.ts:311`, fluxo do hook `src/hooks/use-move-lead-stage.tsx:81-90`. Sem notificação.
- Negócio perdido (com motivo obrigatório): `src/hooks/use-move-lead-stage.tsx:52-74`. Só grava nota/interação, sem notificação.
- Pedido gerado a partir da proposta: `src/lib/omie.functions.ts:150` / `:176` (`ensurePedidoFromProposta`). Sem notificação.
- Aprovação de pedido solicitada e decidida: `src/lib/pedidos.functions.ts:621` (`solicitarAprovacao`) e `:648` (`decidirAprovacao`). Gravam campos de aprovação, não notificam.
- Mudança de etapa de pedido: fila `pedido_notificacoes` é gravada em `src/lib/pedidos.functions.ts:280`, mas o disparo está desligado por `NOTIFY_DISPATCH_ENABLED = false` em `:219` (verificado em `:300`). Leitura read-only em `:903`.
- Faturamento / nota fiscal: `src/lib/pedidos.functions.ts:762` (`nf_emitida_em` quando `fiscal_status = "emitida"`) e histórico em `pedido_fiscal_history`. Sem notificação.
- Ocorrências de pedido (tabela `pedido_ocorrencias`): registradas, sem notificação.
- Meta / snapshot mensal: `src/lib/placar.functions.ts:232` e `src/routes/api/public/hooks/xerife-fechamento.ts:176` (`snapshot_metas_mes`). O snapshot em si não notifica; só a faixa de meta (Bloco 1, item 8) notifica o vendedor.
- Inadimplência: não existe nenhuma tabela, coluna ou código de inadimplência/cobrança no projeto.
