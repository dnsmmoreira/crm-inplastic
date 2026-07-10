# Placar de Vendedores — plano de implementação

Objetivo: criar um placar competitivo com **fonte única no banco**, consumida por três superfícies (página `/placar`, widget do Dashboard, digest do Xerife). Zero cálculo de ranking no front.

---

## 1. Banco — fonte única (migração)

### 1a. Pesos no `xerife_config`
Adicionar colunas (com defaults) para nunca hardcodar no código:
- `placar_peso_ganho int default 10`
- `placar_peso_proposta int default 3`
- `placar_peso_tarefa int default 1`
- `placar_peso_pos_venda int default 2`
- `placar_peso_sla_estourado int default -5`
- `placar_peso_carteira_60 int default -3`

### 1b. Função `public.placar_vendedores(_periodo text)`
`_periodo ∈ {'semana','mes','trimestre'}`. Retorna uma linha por vendedor com todas as colunas da tabela do placar + `score` + `score_periodo_anterior` (para seta de tendência) + `posicao`.

Cálculos:
- **Janela do período**: início/fim em `America/Sao_Paulo` (semana = seg-dom atual; mês = mês atual; trimestre = trimestre atual). Período anterior = mesma duração imediatamente anterior.
- **Ganhos**: `leads` onde stage virou `ganho` no período (usar `etapa_changed_at` + `stage='ganho'`). Valor em R$ soma `estimated_value` (se coluna existe).
- **Propostas**: `leads.proposta_enviada_at` dentro do período.
- **Conversão**: `ganhos::float / NULLIF(propostas,0) * 100` — NULL → front mostra "—".
- **Perdas**: `leads` com `stage='perdido'` e `etapa_changed_at` no período.
- **Leads contatados**: `count(distinct lead_id)` de `tarefas` com `status='concluida'`, `concluida_at` no período, `assignee_id = vendedor`.
- **Tempo médio 1ª resposta**: para leads criados no período, `min(lead_interactions.occurred_at) - leads.created_at`, média (retorna interval → converte para minutos).
- **SLAs estourados**: `xerife_log` onde `regra IN ('A1_escalado','A3_escalado','A2_lead_parado')` no período, `vendedor_id = vendedor`.
- **Carteira em risco**: foto atual — leads do vendedor com `stage='ganho'` e `last_contact_at < now() - 45 dias`; separar contagem 45–60 e 60+.
- **Pós-venda em dia**: `tarefas` `tipo LIKE 'pos_venda_%'` do vendedor concluídas no período — % com `concluida_at <= due_date`.
- **Score**: soma ponderada dos pesos do `xerife_config`; `-3 * carteira_cruzou_60_no_periodo` usa `xerife_log` (regra `B2_carteira_60`).

Função `SECURITY DEFINER`, `STABLE`, `SET search_path = public`. GRANT EXECUTE para `authenticated`.

### 1c. Limpeza da lógica antiga
Remover `useBestSellerOfMonth` de `src/lib/crm-store.ts` **do consumo no Dashboard** (mantém o export só se outro arquivo usa — verificar; se não, deleta).

---

## 2. Server function

`src/lib/placar.functions.ts`:
- `getPlacar({ periodo })` com `requireSupabaseAuth` → `supabase.rpc('placar_vendedores', { _periodo })` + join com `profiles` para nome/avatarColor.
- Retorna DTO: `{ periodo, vendedores: [...], atualizadoEm }`.

---

## 3. Página `/placar`

Nova rota `src/routes/_authenticated/placar.tsx` (visível a todos logados, sem filtro de role):

- **Header**: título + Tabs de período (Semana / Mês / Trimestre — default Mês) via URL search param.
- **Hero "Líder do mês"**: card grande com avatar, nome, score, valor em R$ ganho.
- **Tabela**: uma linha por vendedor. Colunas conforme spec. Medalhas 🥇🥈🥉 nas 3 primeiras. Linha do líder com fundo destacado (`bg-primary/5`).
- **Barra de progresso** por vendedor comparando score com o líder.
- **Seta de tendência** ao lado do score (↑ verde, ↓ vermelho, — cinza) usando `score_periodo_anterior`.
- **Célula carteira em risco**: amarela 45–60d, vermelha 60d+.
- **Loader**: `ensureQueryData` + `useSuspenseQuery`, `staleTime: 60_000`.

Novo item no menu lateral abaixo de "Minha agenda" — "Placar" 🏆.

---

## 4. Widget do Dashboard

`src/components/placar/PlacarWidget.tsx` — top 3 (medalha, nome, score), lê da mesma `getPlacar({ periodo: 'mes' })`. Card inteiro é um `<Link to="/placar">`. Estado vazio: "O ranking aparecerá aqui conforme as vendas acontecerem" + link.

Substituir `<BestSellerCard />` em `src/routes/index.tsx` por `<PlacarWidget />`.

---

## 5. Integração no Xerife (digest 08h + fechamento 18h)

Nos endpoints `src/routes/api/public/hooks/xerife.ts` (resumo diário) e `xerife-fechamento.ts`, chamar `supabaseAdmin.rpc('placar_vendedores', { _periodo: 'mes' })` e anexar top 3 na mensagem WhatsApp do Denis/diretoria:

```
🏆 Placar do mês
1º Fulano — 47 pts
2º Beltrano — 33 pts
3º Ciclano — 28 pts
```

Não altera regras do Xerife, fluxo Lucas nem Omie.

---

## Detalhes técnicos

- Tudo em SP: `AT TIME ZONE 'America/Sao_Paulo'` no SQL.
- RPC via `supabase.rpc` respeita RLS; `SECURITY DEFINER` para poder ler `xerife_log`/`tarefas` de outros vendedores (agregação transparente).
- Query keys: `['placar', periodo]`.
- Sem breaking change: `tarefas`, `leads`, `xerife_log`, `xerife_config` só ganham colunas, nunca mudam existentes.

---

## Confirmações antes de codar

1. **Divisão por zero em conversão**: mostrar "—" quando propostas=0. OK?
2. **Valor em R$ do ganho**: usar `leads.estimated_value` como fonte (é o campo atual). OK?
3. **"Tempo médio 1ª resposta"**: primeira `lead_interactions` OU primeira `whatsapp_mensagens autor=vendedor` — o que vier primeiro. OK?
4. **Score do período anterior**: mesma duração imediatamente anterior (mês passado inteiro quando período=mês). OK?
