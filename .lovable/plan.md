# ARENA — Análise técnica (fase 1, sem alterações)

Levantamento feito sobre o código e o banco reais. **Nada foi alterado**: nenhuma migration, nenhum arquivo de código, nada publicado. Os 8 jobs Xerife (IDs 2–9) foram inventariados e não são tocados por nada deste plano.

## 1. O que já existe e pode ser reaproveitado

- **Placar completo e funcional**: RPC `placar_vendedores(_periodo)` (SECURITY DEFINER, ~245 linhas) já calcula ganhos, propostas, conversão, perdas, leads contatados, tempo de primeira resposta, SLAs estourados, carteira 45–60/60+, pós-venda no prazo, meta, % da meta, faixa da meta, pace de dias úteis, dias sem proposta, score e posição — com comparação contra o período anterior. Períodos: semana / mês / trimestre.
- **Pesos já configuráveis** em `xerife_config`: `placar_peso_ganho`, `placar_peso_proposta`, `placar_peso_tarefa`, `placar_peso_pos_venda`, `placar_peso_sla_estourado`, `placar_peso_carteira_60`, `placar_peso_meta_batida`, `placar_dias_sem_proposta_limite`. Não estão hardcoded no frontend — a base para "parâmetros ARENA configuráveis" já existe.
- **Metas já editáveis por admin**, em dois lugares: diálogo "Metas" em `/placar` (`setMeta`) e campo "Meta mensal" no `UsuarioEditDialog` (grava em `vendedor_metas` e registra em `user_audit_log` com valor anterior/novo).
- **Snapshot mensal**: `snapshot_metas_mes(ano, mes)` + `vendedor_metas_historico` (meta, ganhos, % atingido, bateu) — base pronta para etapa mensal e temporada trimestral da ARENA Premiação.
- **Auditoria já existente**: `user_audit_log` (alvo, ator, campo, valor anterior, valor novo, data), `pedido_fiscal_history`, `lead_stage_history`, `lead_owner_history`, `pedido_stage_history`. Falta apenas o campo **motivo** e um log específico de configuração ARENA.
- **Permissões granulares**: tabelas `perfis`, `permissoes`, `perfil_permissoes`, `user_perfis` + funções `tem_permissao` / `valor_permissao`. Já existe a chave `metas.definir` e a numérica `precos.limite_desconto` (útil para piso/margem).
- **Aprovação de proposta já modelada**: `propostas.approval_requested_at / approval_reason / approved_by_user_id / approved_at` e o equivalente em `pedidos` (`aprovacao_*`). A "aprovação extraordinária da diretoria" pode reusar esse fluxo em vez de criar outro.
- **Score cadastral** (`src/lib/lead-score.ts`) é heurística de risco/CNPJ, explicitamente **não** é o ARENA Score de oportunidade. Fica isolado e apenas vira, no futuro, um componente do ARENA Score.

## 2. Tabelas envolvidas

Leitura (sem alteração nesta entrega): `leads`, `propostas`, `proposta_itens`, `pedidos`, `pedido_itens`, `tarefas`, `lead_interactions`, `xerife_log`, `profiles`, `user_roles`, `perfis`/`user_perfis`/`permissoes`.

Escrita futura: `vendedor_metas`, `vendedor_metas_historico`, `xerife_config`, `user_audit_log`.

Ausentes hoje (não existe **nada** de custo/margem no banco nem no código — busca por custo/comissão/margem só encontrou textos não relacionados): custo comercial, comissões, canal representante, carência/rampa, margem, piso de preço, orçamento ARENA.

## 3. Componentes/páginas afetados (fases seguintes)

- `src/routes/placar.tsx` — renomear rótulos: "Score" → "Score de Atividade — ARENA Premiação"; separar blocos Premiação vs Performance.
- `src/components/placar/PlacarWidget.tsx` — mesmo ajuste de nomenclatura ("pts" → pontos ARENA Premiação).
- `src/lib/placar.functions.ts` — tipos e comentários; sem mudar cálculo.
- `src/components/xerife/XerifeConfigForm.tsx` — nova aba de parâmetros ARENA.
- `src/components/usuarios/UsuarioEditDialog.tsx` — flag de participação ARENA, carência/rampa, motivo na alteração de meta.
- Novas rotas: `/arena` (gestão, admin-only) e componentes em `src/components/arena/`.
- Menu lateral (`src/routes/__root.tsx`) — item ARENA visível só para admin.

## 4. Novas estruturas realmente necessárias

Mínimo viável, sem inventar o que já existe:

| Estrutura | Para quê |
|---|---|
| `arena_config` (linha única, id=1) ou novas colunas em `xerife_config` | teto 7%, comissão Logiscal/Kelly, fator de encargos, margem mínima, piso, cap de premiação, orçamento, duração da carência, metas da rampa |
| `arena_participacao` (ou colunas em `profiles`) | `participa_arena`, `tipo_comercial` (interno / representante / licitacoes / nao_comercial), `carencia_inicio`, `carencia_meses` |
| `comissao_regras` | beneficiário, percentual, **base de cálculo** (faturado / recebido / recebido_liquido / outra), vigência |
| `custo_comercial_mensal` | lançamento mensal de salários, encargos, benefícios, comissões, premiações — origem dos 3 indicadores de custo |
| `arena_aprovacoes_extraordinarias` | solicitante, motivo, margem original/proposta, desconto, aprovador, data, observação (pode ser tabela nova ou extensão do fluxo de aprovação de propostas) |
| `arena_config_audit` | quem/quando/anterior/novo/**motivo** para toda alteração de parâmetro |

Todas admin-only: RLS `has_role(auth.uid(),'admin')` + GRANT só para `authenticated`/`service_role`, e ocultação na UI. Vendedor não lê custo, salário, comissão nem margem — nem os próprios.

## 5. Campos/configurações a adicionar

Config: `custo_interno_teto_pct` (7), `comissao_logiscal_pct` (5), `comissao_kelly_pct` (0,5), `encargos_fator`, `base_calculo_logiscal`, `base_calculo_kelly`, `margem_minima_pct`, `piso_preco_pct`, `arena_orcamento_mensal`, `arena_cap_temporada`, `carencia_meses` (6), `rampa_metas` (85k / 120k / 150k / 175k), `meta_canal_representante` (150k/mês), pesos das rodadas quinzenais.

Permissões novas sugeridas: `arena.gestao.ver`, `arena.config.editar`, `arena.aprovacao_extraordinaria` — usando o mecanismo `tem_permissao` já existente, sem criar outro.

## 6. Riscos de regressão

1. **Placar hoje inclui quem não é vendedor comercial.** Critério atual: `user_roles.role = 'vendedor'`, sem nenhum outro filtro. Isso hoje traz BRUNA COBERCINI (Operacional Comercial) e RENATA PAIXÃO (Financeiro), ambas com meta 0. Admins (Denis, Wagner) já ficam de fora naturalmente. Elas aparecem com score 0 e não distorcem o topo, mas poluem o ranking e a futura premiação.
2. **RPC compartilhada**: `placar_vendedores` é consumida também por `xerife-fechamento.ts`, `xerife.ts` (resumo) e pelo MCP `placar_atual`. Mudar o filtro de participantes muda os três — precisa ser feito em uma migration só, com esses consumidores conferidos.
3. **Meta = ganho por `leads.estimated_value` na etapa 'ganho'**, não por faturamento/recebimento. Custo sobre "recebido" vai divergir do % da meta do placar se isso não for explicitado na tela.
4. **Preview e produção usam o mesmo banco**: qualquer migration é imediata em produção. Por isso as migrations vão uma a uma, para aprovação prévia.
5. **`xerife_config` é lida pela RPC dentro do cálculo**: adicionar colunas é seguro (aditivo), renomear/remover quebraria o placar e o Xerife.
6. Renomear rótulos na UI não afeta cálculo, mas afeta o que os vendedores veem — comunicar antes.

## 7. Metas cadastradas hoje (nenhuma alterada)

| Vendedor | Papel | Perfil | Meta mensal |
|---|---|---|---|
| DANIEL F. MOREIRA | vendedor | Vendedor | R$ 350.000 |
| BEATRIZ | vendedor | Vendedor | R$ 250.000 |
| BIANCA | vendedor | Vendedor | R$ 250.000 |
| KELLY | vendedor | Vendedor | R$ 250.000 |
| PAMELA | vendedor | Vendedor | R$ 0 |
| BRUNA COBERCINI | vendedor | Operacional Comercial | R$ 0 |
| RENATA PAIXÃO | vendedor | Financeiro | R$ 0 |
| WAGNER PAIXÃO | admin | Administrador | — |
| Denis Marcelo Moreira | admin | Administrador | — |

Observações para sua decisão (não executadas): Pamela sem meta; Kelly está com meta de vendedora interna (R$ 250k), enquanto o documento define R$ 150k como referência do canal representante e trilha própria de licitações.

**Critério de participação proposto** (a aprovar): flag explícita `participa_arena` no cadastro do usuário, com default derivado de "papel vendedor + meta ativa > 0", em vez de inferir só pela meta — assim um vendedor em rampa com meta zerada por engano não some do placar, e Renata/Bruna ficam fora por decisão registrada e auditável, não por efeito colateral.

## 8. Ordem recomendada de implementação

**FASE A — arquitetura e nomenclatura (menor risco)**
- A1 (código, sem banco): renomear rótulos no `/placar` e no widget; separar visualmente ARENA Premiação e ARENA Performance; nunca usar "Score" sozinho.
- A2 (migration 1): `arena_participacao` + flag `participa_arena`; backfill marcando apenas os 5 vendedores comerciais; **sem** mudar ainda a RPC.
- A3 (migration 2): `placar_vendedores` passa a filtrar por `participa_arena`; conferir os 3 consumidores.
- A4 (migration 3): `arena_config` com teto, comissões, base de cálculo, encargos, carência, rampa, margem mínima, piso, orçamento e cap.
- A5 (código): carência/rampa no cadastro do vendedor; meta lida sempre do banco.

**FASE B — dashboards e configurações**
- B1: rota `/arena` admin-only + tela de configuração ARENA (nada hardcoded).
- B2: cards separados de ARENA > Gestão — custo interno (teto 7%), custo incremental do canal representante, custo consolidado econômico, margem, custo da premiação, meta do time, carência. Três cards distintos, jamais um número só.
- B3: Kelly em dois bolsos — canal representante e licitações — com réguas independentes.
- B4: aviso "BASES DE CÁLCULO DIFERENTES" quando Logiscal e Kelly não compartilham base; 5,85% nunca é exibido como exato sem reconciliação.
- B5: análise de ponto de equilíbrio representante x interno, com os dois cenários (nova contratação / capacidade ociosa) e **sem** decisão automática.

**FASE C — margem, piso e aprovações**
- C1: estrutura de margem de contribuição (arquitetura pronta, usando piso comercial configurável enquanto custo de produto não existe no banco).
- C2: bloqueio de aprovação automática abaixo da margem mínima + fluxo de aprovação extraordinária da diretoria, reusando o padrão de aprovação já existente em propostas.

**FASE D — auditoria**
- D1: campo **motivo** e log unificado para meta, percentuais, comissões, margem mínima, teto, carência, aprovação extraordinária e configuração ARENA.

ARENA Score, ARENA Performance avançado e ARENA Distribuição ficam para depois da auditoria SQL histórica — nesta entrega a distribuição de leads não é tocada, e ranking de premiação nunca influencia quem recebe lead.

## Perguntas antes da Fase A

1. Confirma a flag explícita `participa_arena` como critério (item 7)?
2. `arena_config` como tabela nova, ou colunas novas em `xerife_config`? (recomendo tabela nova: `xerife_config` já tem 40+ colunas e é lida dentro da RPC do placar)
3. Comissão Logiscal 5% incide sobre **faturado** ou **recebido**?
4. Kelly: mantém meta atual de R$ 250k como vendedora interna, ou passa para o regime de dois bolsos com referência de R$ 150k no canal?
5. Pamela está em carência/rampa? Se sim, desde quando?
