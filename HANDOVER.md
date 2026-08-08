# HANDOVER — CRM INPLASTIC / TAOPLAST

Dossiê de transferência do sistema. Escrito a partir da leitura do repositório real.
Onde algo não existe no código, está marcado como **não implementado**.

> Nenhuma chave, token ou senha real aparece neste documento. Use `.env.example` como referência de nomes.

---

## 1) VISÃO GERAL DO PRODUTO

CRM comercial B2B (com suporte também a venda para Pessoa Física) de uma indústria de
plásticos/pallets, operando três marcas emitentes (INPLASTIC, TAOPLAST, LICITAPLAS).
Cobre o ciclo completo: entrada do lead (WhatsApp/IA) → funil → proposta → pedido →
logística/pós-venda, com um motor de cobrança automática interno chamado **Xerife** e um
agente de IA de atendimento no WhatsApp ("Lucas") orquestrado por n8n.

Público: equipe comercial (vendedores) e administração (ADMINISTRADOR).

### Rotas (arquivo → o que faz)

| Rota | Arquivo | Função |
|---|---|---|
| `/` | `src/routes/index.tsx` | Dashboard: metas, resumo do dia, leads sem resposta +24h, atalhos. |
| `/pipeline` | `src/routes/pipeline.tsx` | Funil de vendas em Kanban (etapas `lead_stage`), drag&drop, abre o `LeadDrawer`. |
| `/clientes` | `src/routes/clientes.index.tsx` | Lista/busca de clientes (PJ e PF), criação via `NovoClienteDialog`. |
| `/clientes/$id` | `src/routes/clientes.$id.tsx` | Ficha do cliente, edição, botão "Conversar no WhatsApp" (cria/reaproveita conversa). |
| `/contatos` | `src/routes/contatos.tsx` | Agenda de contatos derivada de leads/clientes. |
| `/empresas` | `src/routes/empresas.tsx` | Cadastro dos emitentes (tabela `emitters`): CNPJ, IE, dados bancários, PIX. |
| `/propostas` | `src/routes/propostas.index.tsx` | Lista de propostas com status (`proposal_status`). |
| `/propostas/$id` | `src/routes/propostas.$id.tsx` | Editor/impresso da proposta: itens, condição de pagamento, desconto, acréscimo, parcelas, frete, print A4. |
| `/pedidos` | `src/routes/pedidos.tsx` | Kanban operacional do pedido (`pedido_stage`), checklist, fiscal/NF, ocorrências. |
| `/produtos` | `src/routes/produtos.tsx` | Catálogo técnico: dimensões, peso, empilhamento, NCM, preço, estoque. |
| `/tabela-precos` | `src/routes/tabela-precos.tsx` | Tabela de preços somente leitura para o vendedor. |
| `/estoque` | `src/routes/estoque.tsx` | Saldo de `produtos.estoque_atual` e movimentações. |
| `/condicoes-comerciais` | `src/routes/condicoes-comerciais.tsx` | Admin: condições de pagamento, `permite_pf`, `acrescimo_percent`, observações. |
| `/conversas` | `src/routes/conversas.tsx` | "Minhas Conversas" estilo WhatsApp (duas colunas): lista + painel de chat, envio, assumir/devolver/transferir. |
| `/atendimento-ia` | `src/routes/atendimento-ia.tsx` | Somente leitura + **direcionamento** de conversas da IA a um vendedor (admin). |
| `/canais` | `src/routes/canais.tsx` | Canais de entrada + Painel de Saúde do WhatsApp (status Z-API real, envios, opt-outs, alertas). |
| `/agente-ia` | `src/routes/agente-ia.tsx` | Painel do Xerife: configuração, cadência, simulador, log. |
| `/tarefas` | `src/routes/tarefas.tsx` | Tarefas do CRM (manuais e geradas pelo Xerife). |
| `/minha-agenda` | `src/routes/minha-agenda.tsx` | Agenda diária do vendedor. |
| `/placar` | `src/routes/placar.tsx` | Ranking/gamificação de vendedores (RPC `placar_vendedores`). |
| `/relatorios` | `src/routes/relatorios.tsx` | Relatórios comerciais/operacionais. |
| `/usuarios` | `src/routes/usuarios.tsx` | Admin: usuários, papéis, permissões, fila de distribuição, exclusão lógica, vínculo Telegram. |
| `/auth` | `src/routes/auth.tsx` | Login. |
| `/primeiro-acesso` | `src/routes/primeiro-acesso.tsx` | Troca de senha obrigatória (`profiles.senha_reset_exigido`). |
| `/aceitar-convite` | `src/routes/aceitar-convite.tsx` | Aceite de convite de novo usuário. |
| `/mcp`, `/.mcp/*`, `/.well-known/*` | `src/routes/mcp.ts`, `src/routes/[.mcp]/*` | Servidor MCP de leitura do CRM (OAuth via Supabase). |
| `/api/public/*` | `src/routes/api/public/**` | Webhooks: Z-API, Telegram, hooks da IA (n8n) e hooks do Xerife. |

---

## 2) STACK E ARQUITETURA

- **Framework:** TanStack Start v1 (React 19), SSR em runtime edge (Cloudflare Workers via nitro).
- **Roteamento:** TanStack Router, file-based em `src/routes` (`src/routeTree.gen.ts` é gerado).
- **Build:** Vite 8 + `@lovable.dev/vite-tanstack-config` 2.9.1 (`vite.config.ts`). Entry SSR customizado em `src/server.ts`.
- **Hospedagem atual:** Lovable (preview + publicado). Domínio custom: `crm.inplastic.com.br`; publicado em `crm-inplastic.lovable.app`.
- **Banco/Backend:** Lovable Cloud (Supabase Postgres) — Data API + RLS.
- **Auth:** Supabase Auth (e-mail/senha). Sessão anexada às server functions por middleware próprio (`src/lib/auth-bearer.ts` + `src/integrations/supabase/auth-attacher.ts`, registrados em `src/start.ts:24-27`).
- **Backend de aplicação:** `createServerFn` (`src/lib/*.functions.ts`) e rotas de servidor (`src/routes/api/public/**`).

### Bibliotecas principais (versões de `package.json`)

`react` ^19.2.0 · `react-dom` ^19.2.0 · `@tanstack/react-router` ^1.170.16 · `@tanstack/react-start` ^1.168.26 ·
`@tanstack/react-query` ^5.101.1 · `@supabase/supabase-js` ^2.110.0 · `zod` ^3.23.8 · `zustand` ^5.0.14 ·
`tailwindcss` ^4.2.1 · Radix UI (shadcn) · `lucide-react` ^0.575.0 · `recharts` ^2.15.4 · `date-fns` ^4.1.0 ·
`@dnd-kit/core` ^6.3.1 · `sonner` ^2.0.7 · `react-hook-form` ^7.71.2 · `@lovable.dev/mcp-js` ^0.20.0 ·
dev: `vite` ^8.0.16, `typescript` ^5.8.3, `vitest` ^4.1.10, `nitro` 3.0.260603-beta.

### Fluxo (texto)

```
[Navegador / React]
      | useServerFn / loaders (RPC)          | fetch direto (supabase-js, RLS do usuário)
      v                                       v
[Server Functions  src/lib/*.functions.ts] --> [Supabase Postgres + RLS]
      |  (requireSupabaseAuth -> context.supabase, userId)        ^
      |                                                          |
      +--> supabaseAdmin (service_role, só após validar caller) --+
      |
      +--> src/lib/zapi-send.server.ts ----> Z-API (WhatsApp comercial/interno)
      +--> src/lib/telegram-send.server.ts -> Telegram Bot API
      +--> src/lib/n8n-fila.server.ts ------> n8n (agente IA) [+ fila de reenvio]
      +--> Google Maps Distance Matrix / CNPJá / Lovable AI Gateway

[Externos] --> POST /api/public/zapi/webhook        (mensagens recebidas)
           --> POST /api/public/telegram/webhook    (bot interno)
           --> POST /api/public/hooks/ia-*          (respostas do n8n, header secreto N8N_SECRET)
           --> POST /api/public/hooks/xerife*       (cron/n8n, header secreto XERIFE_SECRET)
```

---

## 3) ESTRUTURA DE PASTAS (`src/`)

```
src/
├─ routes/                 # páginas + rotas de servidor (file-based routing)
│  ├─ __root.tsx           # layout raiz: sidebar (com collapse), providers, <head>, Toaster
│  ├─ api/public/          # endpoints públicos (bypass de auth do site) — validam segredo no handler
│  │  ├─ zapi/webhook.ts   # entrada de mensagens WhatsApp; grava zapi_inbox, conversas, opt-out
│  │  ├─ telegram/webhook.ts
│  │  └─ hooks/            # ia-responder, ia-qualificar, ia-urgente, xerife-* (engine, checkpoint,
│  │                       #   fechamento, agenda-diaria, pedidos, watchdog-conversa)
│  └─ *.tsx                # telas listadas na seção 1
├─ lib/
│  ├─ *.functions.ts       # server functions (RPC tipado) por domínio: clientes, pedidos, propostas,
│  │                       #   atendimento, canais, fila, placar, relatórios, usuários, xerife, omie…
│  ├─ *.server.ts          # código exclusivo de servidor (bloqueado no bundle do cliente):
│  │                       #   zapi-send.server.ts (camada anti-bloqueio), telegram-send.server.ts,
│  │                       #   n8n-fila.server.ts
│  ├─ xerife/              # motor Xerife: notify, dedupe, handoff, businessTime, rollover,
│  │                       #   watchdog-conversa (+ testes)
│  ├─ mcp/                 # servidor MCP e ferramentas de leitura (list_leads, pipeline_stats…)
│  ├─ crm-store.ts         # store Zustand do CRM (estado + seed de dados de apoio)
│  ├─ crm-sync.ts          # sincronização store <-> banco (inclui atualização de lastContact)
│  ├─ logistica.ts / logistica.functions.ts  # cubagem, empilhamento, mix de veículos, frete
│  ├─ cnpj.ts / cnpj.functions.ts            # validação/máscara CNPJ e CPF, consulta Receita (CNPJá)
│  ├─ auth-bearer.ts       # middleware client-side que anexa o bearer às server functions
│  └─ format.ts, utils.ts, lead-score.ts, delete-intents.ts, error-*.ts
├─ components/
│  ├─ ui/                  # shadcn/ui
│  ├─ crm/                 # LeadDrawer, LostReasonDialog, TabErrorBoundary
│  ├─ atendimento/         # DistribuirConversasDialog, NovaConversaAlerta, NovaConversaDialog
│  ├─ clientes/ pedidos/ usuarios/ xerife/ placar/ dashboard/ layout/
├─ hooks/                  # use-auth (sessão/papel/permissões), use-move-lead-stage, useNovaConversaAlerta…
├─ integrations/supabase/  # GERADO — client.ts, client.server.ts, auth-middleware.ts, auth-attacher.ts, types.ts
├─ start.ts                # createStart: functionMiddleware (auth) + requestMiddleware (erro)
├─ server.ts               # entry SSR com wrapper de erro
└─ styles.css              # Tailwind v4 + design tokens
```

---

## 4) MODELO DE DADOS

Todas as tabelas ficam no schema `public`, com RLS habilitada e GRANTs explícitos.
Chave primária é `id uuid default gen_random_uuid()` salvo indicação contrária.
O número entre parênteses é a quantidade de políticas RLS ativas; "somente leitura" significa que
INSERT/UPDATE/DELETE não têm política para usuários finais (só `service_role`).

### Comercial / funil

| Tabela | Papel | Observações de RLS |
|---|---|---|
| `leads` | Coração do funil: dados do lead/empresa, etapa, valor estimado, dados fiscais e de venda. FKs: `owner_id→auth.users`, `cliente_id→clientes`, `product_id→produtos`. | 4 políticas: vendedor vê/edita os próprios; admin vê tudo. |
| `lead_itens` | Itens cotados dentro do lead. FK `lead_id`. | 4 políticas, herdadas do acesso ao lead. |
| `lead_interactions` | Histórico de interações (email, call, meeting, note, whatsapp); dispara trigger de `last_interaction_at`. | 4 políticas. |
| `lead_ai_actions` | Ações do agente de IA sobre o lead (followup, qualify, resumo…). | 2 políticas; sem UPDATE/DELETE. |
| `lead_stage_history` | Auditoria de mudança de etapa (etapa anterior/nova, origem, contexto). | 1 política de leitura; escrita só por trigger/service_role. |
| `lead_owner_history` | Auditoria de troca de responsável. | idem acima. |
| `clientes` | Cadastro do cliente PJ/PF (`tipo_pessoa`, `cnpj` ou `cpf`, IE, SUFRAMA, Simples, endereço, vendedor). | 4 políticas; exclusão é lógica via `ativo`. |
| `produtos` | Catálogo técnico: SKU, dimensões, peso, `pecas_por_coluna`, `stack_height_cm`, NCM, preço, `estoque_atual`. | 2 políticas (leitura autenticada; escrita admin). |
| `produtos_omie` | Espelho do catálogo Omie (legado da integração). | 4 políticas, restritas. |
| `emitters` | Empresas emitentes das propostas (marca, CNPJ, IE, banco, PIX). PK `text`. | 2 políticas. |
| `condicoes_pagamento` | Condições de pagamento (`splits` jsonb, `permite_pf`, `acrescimo_percent`, `notes`). PK `text`. | 2 políticas (leitura geral, escrita admin). |
| `propostas` | Proposta comercial: número, emitente, status, validade, desconto, transporte, aprovação. | 4 políticas. |
| `proposta_itens` / `proposta_parcelas` | Itens e parcelas da proposta. | 1 política cada, via proposta. |
| `pedidos` | Pedido operacional: número `PED-AAAA-0000`, `stage`, snapshot da proposta, fiscal/NF, logística, checklist, aprovação. | 4 políticas. |
| `pedido_itens` | Itens do pedido (dá baixa em estoque por trigger). | 1 política. |
| `pedido_stage_history`, `pedido_fiscal_history`, `pedido_ocorrencias`, `pedido_notificacoes` | Auditoria de etapa, de campos fiscais, ocorrências e notificações do pedido. | 1 política cada. |
| `tarefas` | Tarefas do CRM (manuais e automáticas do Xerife): prazo, prioridade, status, escalonamentos. | 1 política. |

### Atendimento / WhatsApp

| Tabela | Papel | RLS |
|---|---|---|
| `whatsapp_conversas` | Conversa por telefone; status (`ia_atendendo`, `humano_atendendo`, `qualificado`, `encerrado`), `ia_ativa`, `atribuido_para`, `requer_humano`. | 2 políticas; **sem INSERT/DELETE** para usuários (criação só via `supabaseAdmin`). |
| `whatsapp_mensagens` | Mensagens da conversa (`direcao`, `autor`, `tipo`, `midia` jsonb). | 2 políticas; sem UPDATE/DELETE (histórico imutável). |
| `whatsapp_optout` | Telefones que pediram para não receber mensagens. PK `phone`. | 1 política de leitura; escrita só service_role. |
| `zapi_inbox` | Log bruto de tudo que chega do webhook Z-API. | 3 políticas; sem DELETE. |
| `zapi_envios` | Registro de cada envio confirmado (canal, phone, ctx, `mensagem_hash`) — base de rate limit, anti-duplicado e idempotência. | leitura autenticada; escrita service_role. |
| `zapi_alertas` | Alertas de infraestrutura (ex.: `desconectado`). | leitura autenticada; escrita service_role. |
| `n8n_reenvio_fila` | Fila de reenvio ao n8n com tentativas/backoff. | 1 política de leitura. |
| `notificacoes` | Notificações in-app (sino), por usuário e conversa. | 3 políticas; INSERT só service_role. |

### Pessoas, papéis e gestão

| Tabela | Papel | RLS |
|---|---|---|
| `profiles` | Perfil do usuário (nome, cor, cargo, fuso, canais de entrada, limite de leads, Telegram, soft-delete). PK = `auth.users.id`. | 4 políticas; sem INSERT/DELETE (criado por trigger `handle_new_user`). |
| `user_roles` | **Fonte única de papel** (`app_role`: admin/vendedor). Separada de `profiles` por segurança. | 3 políticas; leitura autenticada. |
| `user_permissions` | Flags finas (ver_todos_leads, editar/excluir propostas, exportar, relatórios, gerenciar usuários, integrações). | 2 políticas. |
| `user_audit_log` | Auditoria de alterações em usuários. | 1 política de leitura. |
| `fila_vendedores` / `fila_estado` | Fila round-robin de distribuição de leads (posição, ativo) e ponteiro do último atendido. | `fila_vendedores`: 2 políticas; `fila_estado`: sem políticas (só service_role/RPC). |
| `vendedor_metas` / `vendedor_metas_historico` | Meta mensal por vendedor e snapshot histórico mensal. | 2 políticas cada. |
| `xerife_config` | Parâmetros do motor Xerife (SLAs, cadências, pesos do placar, janelas, watchdog). Linha única. | 2 políticas. |
| `xerife_log` | Log de ações tomadas pelo Xerife. | 2 políticas; sem UPDATE/DELETE. |
| `system_workspace` / `user_workspaces` | Estado serializado (jsonb) global e por usuário usado pelo store do CRM. | 3 e 7 políticas. |

### Enums

`app_role`, `lead_stage`, `pedido_stage`, `proposal_status`, `interaction_type`, `ai_action_type`,
`conversa_status`, `msg_direcao`, `msg_autor` (valores completos no schema do banco).

### Functions (SECURITY DEFINER onde indicado)

- `has_role(_user_id, _role)` — base de todas as políticas de admin.
- `atribuir_proximo_vendedor(_lead_id)` — round-robin da fila.
- `next_proposta_number(_year)` / `next_pedido_number(_year)` — numeração sequencial com advisory lock (EXECUTE restrito).
- `placar_vendedores(_periodo)` — ranking calculado.
- `snapshot_metas_mes(ano, mes)`, `admins_ativos_count()`, `cnpj_status(_cnpj)`, `handle_new_user()`.

### Triggers principais

`tg_leads_stage_track`, `tg_lead_history_track`, `tg_lead_interaction_touch`, `tg_touch_lead_last_interaction`,
`tg_wa_msg_lead_touch`, `tg_touch_conversa`, `tg_conversa_atribuida_notifica`, `tg_pedido_item_baixa_estoque`,
`tg_produto_estoque_touch`, `tg_tarefas_sync`, `tg_tarefas_protect`, `tg_tarefa_concluida_touch`,
`tg_clientes_touch_atualizado_em`, `set_updated_at` / `tg_set_updated_at`.

> Índices: além das PKs/FKs, existem índices em `zapi_envios (phone, created_at desc)` e `(canal, created_at desc)`,
> índice único parcial em `clientes.cpf` (WHERE cpf IS NOT NULL) e unicidade em `user_roles (user_id, role)`.
> Demais índices são os criados nas migrations em `supabase/migrations/`.

---

## 5) PAPÉIS E PERMISSÕES

Dois perfis (`app_role`): **admin** (ADMINISTRADOR) e **vendedor**.

- Papel é lido de `user_roles` e nunca de `profiles`: `src/hooks/use-auth.tsx:83` (query) e `:87` (derivação do papel).
- Permissões base por papel: `ADMIN_PERMISSIONS` / `VENDEDOR_PERMISSIONS` aplicadas em `src/hooks/use-auth.tsx:90`, com override de `gerenciar_usuarios` em `:97`; refinamentos por usuário vêm de `user_permissions`.
- No banco a verificação é `public.has_role(auth.uid(), 'admin')` dentro das políticas RLS de praticamente todas as tabelas.
- No servidor, cada server function usa `.middleware([requireSupabaseAuth])` (`src/integrations/supabase/auth-middleware.ts`) e opera com o `supabase` do próprio usuário — a RLS é a barreira real. Funções administrativas (ex.: `src/lib/zapi-painel.functions.ts`, `src/lib/usuarios.functions.ts`, `src/lib/fila.functions.ts`) checam o papel antes de usar `supabaseAdmin`.

**Vendedor pode:** ver/editar apenas os próprios leads, clientes e propostas; usar `/conversas` com as conversas
atribuídas a ele; criar tarefas; ver `/tabela-precos`, `/placar`, `/minha-agenda`, `/pedidos` do seu escopo.

**Admin pode:** tudo do vendedor, sem filtro de dono, além de `/usuarios`, `/condicoes-comerciais`, `/empresas`,
`/canais` (painel de saúde e opt-outs), `/atendimento-ia` (direcionar conversas), `/agente-ia` (config do Xerife),
`/relatorios` e a fila de distribuição.

---

## 6) VARIÁVEIS DE AMBIENTE E SEGREDOS

Todos os valores são **placeholders** — os reais ficam nos Secrets do projeto (Lovable Cloud) e nunca no repositório.
Arquivo `.env.example` na raiz lista todas as chaves vazias.

| Variável | Para que serve | Onde é usada (arquivo:linha) | Obrigatória | Onde obter |
|---|---|---|---|---|
| `SUPABASE_URL` | URL do backend (servidor) | `src/integrations/supabase/client.ts:33`, `client.server.ts:33`, `auth-middleware.ts:36` | Sim | Gerada pelo Lovable Cloud |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública (RLS aplicada) | `client.ts:34`, `auth-middleware.ts:37`, `src/lib/mcp/tools/*.ts` | Sim | Lovable Cloud |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente privilegiado (ignora RLS) | `src/integrations/supabase/client.server.ts:34` | Sim | Lovable Cloud (não exposta ao usuário) |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_*` | Identificação do projeto no cliente e no MCP | `.env`, `src/lib/mcp/index.ts:10` | Sim | Lovable Cloud |
| `ZAPI_INSTANCE_ID` | Instância Z-API do canal **comercial** | `src/lib/zapi-send.server.ts:67`, `src/lib/zapi.functions.ts:35` | Sim | Painel Z-API |
| `ZAPI_TOKEN` | Token da instância comercial | `zapi-send.server.ts:68`, `zapi.functions.ts:36` | Sim | Painel Z-API |
| `ZAPI_CLIENT_TOKEN` | Header `Client-Token` da conta Z-API | `zapi-send.server.ts:70`, `zapi.functions.ts:37` | Sim | Painel Z-API (Segurança) |
| `ZAPI_INTERNO_INSTANCE_ID` | Instância do canal **interno** (avisos à equipe) | `zapi-send.server.ts:67`, `src/lib/xerife/notify.server.ts:99` | Sim | Painel Z-API |
| `ZAPI_INTERNO_TOKEN` | Token do canal interno | `zapi-send.server.ts:68`, `notify.server.ts:100` | Sim | Painel Z-API |
| `ZAPI_INTERNO_CLIENT_TOKEN` | `Client-Token` do canal interno | `zapi-send.server.ts:70`, `notify.server.ts:101` | Sim | Painel Z-API |
| `N8N_WEBHOOK_URL` | URL do fluxo n8n que roda o agente de IA | `src/lib/n8n-fila.server.ts:72` | Sim (para IA) | Instância n8n do dono |
| `N8N_SECRET` | Segredo compartilhado dos hooks IA | `n8n-fila.server.ts:73`, `src/routes/api/public/hooks/ia-responder.ts:20`, `ia-qualificar.ts:34`, `ia-urgente.ts:34` | Sim (para IA) | Definido pelo dono (string aleatória forte) |
| `XERIFE_SECRET` | Segredo dos hooks do motor Xerife (cron) | `hooks/xerife-engine.ts:667`, `xerife-checkpoint.ts:86`, `xerife-fechamento.ts:215`, `xerife-agenda-diaria.ts:159` | Sim | Definido pelo dono |
| `TELEGRAM_BOT_TOKEN` | Bot de notificações internas | `src/lib/telegram-send.server.ts:12`, `src/lib/xerife/notify.server.ts:69` | Não (opcional) | @BotFather |
| `TELEGRAM_BOT_USERNAME` | Deep link de vínculo do usuário | `src/lib/telegram-vinculo.functions.ts:27` | Não | @BotFather |
| `TELEGRAM_CHAT_DIRETORIA` | Chat que recebe alertas críticos | `notify.server.ts:138`, `zapi-send.server.ts:141` | Não | ID do chat/grupo |
| `TELEGRAM_CHAT_FINANCEIRO` | Chat do financeiro | `notify.server.ts:148` | Não | ID do chat/grupo |
| `WHATSAPP_DIRETORIA` | Telefone da diretoria para alertas | `zapi-send.server.ts:140`, `notify.server.ts:137`, `hooks/ia-urgente.ts:146` | Não | Definido pelo dono |
| `WHATSAPP_FINANCEIRO` | Telefone do financeiro | `notify.server.ts:147` | Não | Definido pelo dono |
| `GOOGLE_MAPS_API_KEY` | Distância/rota para cálculo de frete | `src/lib/logistica.functions.ts:22`, `src/lib/freight.functions.ts:8` | Não (frete degrada) | Google Cloud Console (Distance Matrix API) |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` | Chave de navegador do conector Maps | `.env` (fallback do conector) | Não | Conector Lovable / Google Cloud |
| `CNPJA_API_KEY` | Consulta de CNPJ na Receita | `src/lib/cnpj.functions.ts:105` | Não (busca automática desativa) | cnpja.com |
| `LOVABLE_API_KEY` | Lovable AI Gateway (apoio a cálculos) | `src/lib/logistica.functions.ts:71`, `src/lib/freight.functions.ts:82` | Não | Lovable (gerada automaticamente) |

---

## 7) INTEGRAÇÕES EXTERNAS

### 7.1 Z-API (WhatsApp) — comercial e interno
- **O que faz:** envia e recebe mensagens de WhatsApp. Dois canais fisicamente separados: `comercial` (fala com cliente) e `interno` (alertas para a equipe). Sem fallback entre eles.
- **Endpoints:** `POST https://api.z-api.io/instances/{id}/token/{token}/send-text` e `GET .../status`, sempre com header `Client-Token`.
- **Arquivos:** `src/lib/zapi-send.server.ts` (único caminho de envio), `src/lib/zapi.functions.ts` (status), `src/lib/zapi-painel.functions.ts` (painel admin), `src/routes/api/public/zapi/webhook.ts` (entrada), `src/lib/zapi-normalize.ts`.
- **Custo:** plano pago por instância na Z-API (duas instâncias/números).
- **Troca de conta:** 1) criar conta Z-API e duas instâncias; 2) conectar cada número por QR Code; 3) copiar Instance ID, Token e Client-Token; 4) atualizar os 6 secrets `ZAPI_*`; 5) apontar o webhook "ao receber" de cada instância para `https://<dominio>/api/public/zapi/webhook`; 6) validar em `/canais` que o status ficou verde; 7) enviar 1 mensagem de teste manual.

### 7.2 n8n (agente de IA "Lucas")
- **O que faz:** recebe eventos do CRM, roda o prompt do agente e devolve a resposta/qualificação pelos hooks públicos.
- **Endpoints:** saída — `N8N_WEBHOOK_URL`; entrada — `POST /api/public/hooks/ia-responder`, `/ia-qualificar`, `/ia-urgente` (validam `N8N_SECRET`).
- **Arquivos:** `src/lib/n8n-fila.server.ts` (envio + fila de reenvio `n8n_reenvio_fila`), `src/routes/api/public/hooks/ia-*.ts`.
- **Custo:** n8n self-hosted ou n8n Cloud (plano do dono) + custo do modelo de IA usado dentro do fluxo.
- **Troca de conta:** 1) exportar/importar o workflow na nova instância n8n; 2) gerar novo `N8N_SECRET` e cadastrar nos dois lados; 3) atualizar `N8N_WEBHOOK_URL`; 4) apontar os nós HTTP do n8n para o novo domínio do CRM; 5) testar com uma conversa real de baixa criticidade.

### 7.3 Motor Xerife (cron externo)
- **O que faz:** cobra SLAs, gera tarefas, agenda diária, fechamento, watchdog de conversa.
- **Endpoints:** `/api/public/hooks/xerife`, `xerife-engine`, `xerife-checkpoint`, `xerife-fechamento`, `xerife-agenda-diaria`, `xerife-pedidos`, `xerife-watchdog-conversa` — todos exigem `XERIFE_SECRET`.
- **Troca de conta:** recriar os agendamentos (n8n schedule / pg_cron / cron externo) apontando para o novo domínio com o novo segredo.

### 7.4 Telegram
- **O que faz:** notificações internas para diretoria/financeiro e vínculo por usuário (`profiles.telegram_chat_id`).
- **Arquivos:** `src/lib/telegram-send.server.ts`, `src/lib/telegram-vinculo.functions.ts`, `src/routes/api/public/telegram/webhook.ts`.
- **Troca de conta:** criar bot no @BotFather, atualizar `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`, apontar o webhook do bot para `/api/public/telegram/webhook`, revincular os usuários e atualizar os chat IDs.

### 7.5 Google Maps (Distance Matrix)
- **O que faz:** distância origem→destino para o cálculo de frete/logística.
- **Arquivos:** `src/lib/logistica.functions.ts:22`, `src/lib/freight.functions.ts:8`.
- **Custo:** pay-as-you-go do Google Cloud.
- **Troca de conta:** criar projeto no Google Cloud, habilitar Distance Matrix, gerar chave com restrição, atualizar `GOOGLE_MAPS_API_KEY`.

### 7.6 CNPJá (consulta de CNPJ)
- **Arquivo:** `src/lib/cnpj.functions.ts:105`. Sem chave, a busca automática de dados na Receita fica indisponível (cadastro manual continua funcionando).

### 7.7 Omie (ERP)
- **Situação:** integração **removida da UI**; restam artefatos no código (`src/lib/omie.functions.ts`) e no banco (`produtos_omie`, colunas `omie_*` em `leads`, `propostas`, `pedidos`, `clientes`). Hoje o CRM opera independente do ERP.

### 7.8 E-mail
- **Não implementado.** Não existe envio de e-mail transacional no código (apenas os e-mails de autenticação do próprio backend).

### 7.9 MCP
- Servidor MCP de leitura (`src/lib/mcp/index.ts`) com OAuth via Supabase; ferramentas read-only respeitando RLS.

---

## 8) REGRAS DE NEGÓCIO CRÍTICAS (anti-bloqueio do WhatsApp)

Tudo vive em **`src/lib/zapi-send.server.ts`**, que é o **único** caminho de envio.
Motivo histórico: o número comercial já foi bloqueado pelo WhatsApp uma vez, e a Z-API respondia HTTP 200
mesmo com a instância desconectada. **Nada abaixo pode ser removido, afrouxado ou contornado.**

1. **Guarda de conexão** (`garantirConectado`, linhas ~76-115): antes de qualquer envio consulta `GET /status` do canal e exige `connected === true` **e** `smartphoneConnected === true`. Resultado cacheado 60s por canal. Desconectado → lança "WhatsApp desconectado (Z-API). Mensagem nao enviada.".
2. **Validação real de entrega** (linhas ~353-369): HTTP 200 não basta; faz `JSON.parse` do corpo e exige `zaapId` ou `messageId`. Sem identificador, é falha — e **não** há retry (pode ter entregue).
3. **Rate limit + jitter** (linhas ~235-287): bloqueia se houve envio ao mesmo telefone nos últimos 20s, se o canal passou de 20 envios em 60s, ou de 200 envios em 24h; aplica atraso aleatório de 1500–4000 ms antes de cada envio para não ter cadência robótica. Base de contagem: tabela `zapi_envios`.
4. **Anti-duplicado** (linhas ~272-281): hash SHA-256 do texto normalizado (minúsculas, sem acentos, sem espaços duplicados). Mesmo `phone + mensagem_hash` nos últimos 10 minutos → "Mensagem duplicada bloqueada (anti-spam).".
5. **Opt-out e janela de envio** (linhas ~210-233): telefone presente em `whatsapp_optout` nunca recebe nada. Envios **automáticos** (ctx `ia-responder` ou contendo `xerife`) são bloqueados fora de 07:00–20:00 (America/Sao_Paulo) e aos domingos; envios **manuais** do vendedor só registram aviso no log. O opt-out é criado automaticamente pelo webhook quando o cliente escreve "sair", "parar", "pare", "descadastrar", "nao quero" ou "me tira" (`src/routes/api/public/zapi/webhook.ts`), que também desliga `ia_ativa`.

**Retry com backoff** (linhas ~304-378): no máximo 2 tentativas extras (2s e 5s) e **somente** para falhas transitórias — erro de rede/timeout, HTTP 429, 500, 502, 503, 504. Nunca há retry para bloqueios das regras 1–5, para 4xx que não seja 429, nem para resposta sem `zaapId`/`messageId`. Cada tentativa é logada com o número.

**Idempotência** (`jaEnviadoRecentemente`, linhas ~293-302): antes de cada retry reconsulta `zapi_envios` por `phone + mensagem_hash` nos últimos 60s; se já existir registro, aborta o retry e considera enviado. Cada mensagem é gravada **uma única vez** em `zapi_envios`.

**Alerta de desconexão** (`registrarAlertaDesconexao`, linhas ~122-151): grava em `zapi_alertas` e dispara **uma** notificação interna por canal a cada 60 minutos via `enviarNotificacaoInterna` com `bypassGuards: true` (senão o próprio alerta seria bloqueado pelas travas). Falha do alerta apenas loga com `console.error` — nunca derruba o fluxo nem mascara o erro original.

**Canal interno vs comercial** (`credenciais`, linhas ~63-72): credenciais totalmente separadas; **jamais** criar fallback do interno para o comercial — isso queimaria o número que fala com o cliente.

**Ordem de gravação:** a mensagem só é gravada em `whatsapp_mensagens` **depois** do envio bem-sucedido (`src/lib/canais.functions.ts:37-45`). Se o envio for bloqueado ou falhar, nada é gravado e o erro sobe até o toast em `/conversas`.

**Observabilidade:** todo bloqueio emite `console.warn` no formato `[zapi:{canal}:{ctx}] BLOQUEADO motivo=<motivo> phone=<phone>`.

Outras regras de negócio relevantes:
- Mudança de etapa para "ganho" exige proposta (`src/hooks/use-move-lead-stage.tsx`); lead perdido exige motivo (`LostReasonDialog`).
- Cliente PF só pode usar condições com `permite_pf = true` (à vista ou cartão); `acrescimo_percent` entra no total da proposta.
- Numeração de proposta/pedido é sequencial por ano com advisory lock — não gerar número no cliente.
- Baixa de estoque acontece por trigger ao inserir `pedido_itens`.

---

## 9) OPERAÇÃO E MONITORAMENTO

- **Painel de Saúde do WhatsApp:** `/canais` (admin). Mostra status real da instância (verde conectado / vermelho desconectado / amarelo não configurado), horário da última verificação e botão de recarregar; resumo de envios (24h por canal e última hora), últimos 20 envios com telefone mascarado, opt-outs (com remoção mediante confirmação) e alertas das últimas 48h. Backend: `src/lib/zapi-painel.functions.ts` e `src/lib/zapi.functions.ts`.
- **Logs:** console do backend (Lovable Cloud → logs de função/servidor). Procure pelos prefixos `[zapi:...]`, `BLOQUEADO`, `[zapi:alerta]`.
- **Tabelas de auditoria:** `zapi_envios`, `zapi_alertas`, `zapi_inbox`, `xerife_log`, `lead_stage_history`, `lead_owner_history`, `user_audit_log`, `pedido_stage_history`.
- **Quando a instância cai:** 1) confirmar em `/canais`; 2) abrir o painel Z-API e reconectar o QR Code no celular do número; 3) aguardar até 60s (cache do status) e recarregar; 4) checar `zapi_alertas` para saber desde quando; 5) mensagens bloqueadas **não** ficam em fila — precisam ser reenviadas manualmente pelo vendedor; 6) se o bloqueio for do WhatsApp (não desconexão), não force envios: as travas existem exatamente para permitir o aquecimento do número.

---

## 10) COMO RODAR LOCALMENTE

Pré-requisitos: Node 20+ e **bun** (recomendado); acesso ao projeto de backend (Supabase/Lovable Cloud).

```bash
bun install
cp .env.example .env      # preencher com as chaves do seu ambiente
bun run dev               # http://localhost:8080
bun run build             # build de produção
bun run build:dev         # build em modo development
bun run test              # vitest
bun run lint              # eslint
```

- Migrações: arquivos SQL em `supabase/migrations/` (aplicadas pela plataforma; em ambiente próprio, via Supabase CLI).
- **Seed:** não há script de seed de banco. O que existe é o seed em memória do store (`src/lib/crm-store.ts`) para dados de apoio (ex.: condições de pagamento). Dados transacionais reais nascem pela operação.

---

## 11) MIGRAÇÃO E TROCA DE TITULARIDADE (ordem correta)

1. **Congelar mudanças**: avisar a equipe, evitar deploys durante a janela.
2. **Repositório**: transferir o repositório Git (ou dar acesso) ao novo dono.
3. **Projeto Lovable**: transferir o projeto/workspace para a conta do novo dono (mantém preview, publicação e Cloud vinculados).
4. **Backend/banco**: se permanecer no mesmo projeto Cloud, basta a transferência do item 3. Se mudar de infra, exportar o dump completo (schema + dados), restaurar no novo projeto, reaplicar migrations pendentes, **conferir GRANTs e políticas RLS** e recriar os usuários em `auth.users` (as FKs `owner_id`, `user_id` dependem deles).
5. **Secrets**: recadastrar todas as variáveis da seção 6 no novo ambiente **antes** de apontar o domínio.
6. **Integrações** (uma a uma, testando): Z-API (2 instâncias + webhooks), n8n (workflow + `N8N_SECRET` + URLs), Telegram (bot + webhook), Google Maps, CNPJá.
7. **Cron do Xerife**: recriar os agendamentos com o novo `XERIFE_SECRET` e a nova URL.
8. **Domínio e DNS**: só depois de tudo verde, apontar `crm.inplastic.com.br` (ou o novo domínio) para a nova publicação; manter o antigo no ar até a propagação concluir.
9. **E-mails de autenticação**: revisar remetente/templates de auth no novo projeto e testar recuperação de senha.
10. **Usuários**: validar login de um admin e de um vendedor, papéis em `user_roles` e permissões.
11. **Teste de ponta a ponta**: receber uma mensagem no WhatsApp, responder por `/conversas`, criar lead → proposta → pedido.
12. **Desativação**: só então revogar acessos antigos, desconectar as instâncias Z-API antigas e arquivar o ambiente anterior (guardar backup do dump por pelo menos 90 dias).

---

## 12) RISCOS, DÍVIDA TÉCNICA E PENDÊNCIAS

- **Resíduo do Omie**: código (`src/lib/omie.functions.ts`) e colunas `omie_*` continuam no banco sem uso pela UI — limpeza pendente.
- **Dependência de terceiros no caminho crítico**: se a Z-API bloquear/derrubar a instância, o atendimento para. Não há provedor alternativo nem fila de mensagens pendentes — mensagens bloqueadas são perdidas para o usuário (só o erro aparece no toast).
- **Cache de status em memória (60s)**: por instância do worker; em ambiente com múltiplas instâncias o status pode ser consultado mais vezes que o esperado.
- **Rate limits e janelas são constantes no código** (`JANELA_*`, `LIMITE_*`, 07:00–20:00) — não há tela de configuração.
- **Prompt da IA e lógica do agente vivem no n8n**, fora deste repositório: o novo dono precisa receber o workflow separadamente. Sem ele, a IA não funciona.
- **IA sem acesso ao catálogo de produtos** (limitação já observada): o agente não consulta `produtos`/`produtos_omie`, então não sabe indicar o pallet correto. Melhoria conhecida: expor uma ferramenta MCP de catálogo.
- **Store Zustand + banco**: `crm-store.ts`/`crm-sync.ts` mantêm estado espelhado com persistência em `user_workspaces`/`system_workspace` — arquitetura mais frágil e mais difícil de auditar que ler direto do banco.
- **Seed em código**: condições de pagamento e dados de apoio nascem de literais no store; um reseed pode sobrescrever ajustes feitos pelo admin.
- **`fila_estado` sem políticas RLS**: acessível apenas por `service_role`/RPC — correto, mas exige atenção em qualquer refatoração.
- **Cobertura de testes baixa**: apenas `src/lib/pedidos.functions.test.ts` e `src/lib/xerife/rollover.server.test.ts`.
- **E-mail transacional não implementado**: notificações dependem de WhatsApp/Telegram/in-app.
- **Endpoints públicos** (`/api/public/*`) dependem exclusivamente de segredo compartilhado em header; vazamento do segredo expõe os hooks — rotacionar periodicamente.
- **Arquivos gerados** (`src/integrations/supabase/*`, `src/routeTree.gen.ts`) não devem ser editados à mão.

---

## 13) GLOSSÁRIO

- **Lead** — oportunidade comercial no funil (`leads`).
- **Etapa / stage** — fase do lead: `atendimento`, `novo`, `qualificacao`, `proposta`, `negociacao`, `ganho`, `perdido`.
- **Proposta** — orçamento formal emitido por um emitente (`propostas`), numerada por ano.
- **Pedido** — proposta ganha convertida em operação (`pedidos`), numerada `PED-AAAA-0000`, com etapas de produção/expedição.
- **Emitente / emitter** — empresa do grupo que assina a proposta (INPLASTIC, TAOPLAST, LICITAPLAS).
- **Xerife** — motor interno de cobrança/SLA que gera tarefas, alertas e a agenda diária.
- **Placar** — ranking de vendedores por metas, conversão e SLAs.
- **Fila** — round-robin de distribuição automática de leads entre vendedores (`fila_vendedores`).
- **Handoff** — passagem do atendimento da IA para um humano.
- **Canal comercial / canal interno** — números de WhatsApp separados: cliente vs. equipe.
- **Opt-out** — contato que pediu para não receber mensagens (`whatsapp_optout`).
- **Jitter** — atraso aleatório antes do envio para evitar cadência robótica.
- **Ctx** — rótulo de origem do envio (`sendConversaMessage`, `ia-responder`, `xerife-*`) usado nas travas e logs.
- **PJ / PF** — pessoa jurídica (CNPJ) / pessoa física (CPF).
- **SUFRAMA** — regime de isenção da Zona Franca de Manaus (campos em `clientes`).
- **Cubagem / empilhamento** — cálculo de volume, altura de pilha e ocupação de veículo a partir das dimensões do produto.
- **Acréscimo (`acrescimo_percent`)** — taxa somada ao total conforme a condição de pagamento (ex.: cartão).
- **RLS** — Row Level Security: regras do banco que limitam o que cada usuário enxerga.
