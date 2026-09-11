# Operacional: ocorrências, prazo real, avisos ao vendedor e Xerife

Plano técnico para revisão antes de codar. Nada publicado; sem mexer em RLS/policies
existentes (a nova coluna entra em tabela já existente, sem alterar policy).

## O que já existe (levantamento)

- `pedido_ocorrencias` já existe e JÁ é gravada: `registrarOcorrencia` insere linha
  (tipo, severidade, descrição, `stage_no_momento`, `criada_por`) e o
  `PedidoDetailDrawer` mostra "Abertas" e "Resolvidas". O problema real é que a
  mesma função também sobrescreve o campo-resumo `pedidos.ocorrencia`, e a lista
  no drawer é dividida por resolvida/não-resolvida, não como linha do tempo.
- Prazo hoje é só `pedidos.previsao_entrega` (herdado da proposta). Não há prazo
  real separado. "Atrasado" é calculado em: `pedidos.tsx` (badge e KPI),
  `PedidosEmAbertoReport.tsx` (`estaAtrasado`), `relatorios.tsx` e no Xerife
  (`xerife-pedidos.ts`, regra `pedido_previsao_atrasada`).
- Etapas de coleta/entrega e faturado/em rota no fluxo atual: **`pronto`** e
  **`faturado_em_rota`** (as antigas `faturado_aguardando_coleta` /
  `despachado_transporte` são legado do enum, fora do kanban).
- Pop-up com aceite obrigatório já existe: `notificarUsuarios(..., exigeAceite)`
  → `notificacoes.exige_aceite` → `useAlertasPendentes` + `AlertaPendente`.
- Xerife de pedidos já tem `criarTarefa` com dedupe por `xerife_log` e helper
  `diasUteisEntre`.

## Frente 1 — `pedido_ocorrencias` como log real

- `registrarOcorrencia`: deixa de sobrescrever `pedidos.ocorrencia`; passa a
  gravar só a linha nova. `pedidos.ocorrencia` fica como campo legado somente
  leitura (não removemos agora para não quebrar filtros/relatórios; ele deixa
  de ser fonte de verdade e os filtros passam a usar contagem de ocorrências).
- Nova opção de "observação livre": tipo `observacao`, severidade `baixa`,
  gravada já como resolvida (não bloqueia avanço para pós-venda, que hoje é
  travado por ocorrência aberta). Botão separado no drawer: "Adicionar observação".
- Drawer: novo bloco "Histórico" com TODAS as linhas em ordem decrescente
  (data, tipo, severidade, quem registrou, descrição, resolução se houver),
  mantendo o bloco atual de pendências abertas com ação de resolver.

## Frente 2 — Prazo real de entrega

- Migration (tabela existente, sem tocar policies):
  `pedidos.prazo_real_entrega date null`.
- Nova server fn `definirPrazoRealEntrega({ pedido_id, prazo, motivo? })`,
  guardada pela permissão de movimentar pedidos, que:
  1. lê o valor anterior, grava o novo;
  2. registra `pedido_ocorrencias` tipo `prazo_alterado`, severidade `baixa`,
     já resolvida, descrição "Prazo alterado de X para Y — motivo";
  3. dispara a notificação da frente 3.
- Helper puro novo `src/lib/pedido-prazo.ts`:
  `prazoEfetivo(pedido) = prazo_real_entrega ?? previsao_entrega`,
  `estaAtrasado(pedido, hoje)`, `venceEmHoras(pedido, agora)`.
  Todos os pontos de "atrasado" passam a usar `prazoEfetivo`:
  `pedidos.tsx`, `PedidosEmAbertoReport.tsx`, `relatorios.tsx`, Xerife.
  Sem prazo real → comportamento atual, idêntico.
- UI: campo de data "Prazo real de entrega" no drawer (com o prazo original
  exibido ao lado), motivo opcional.

## Frente 3 — Aviso ao vendedor (pop-up com aceite)

- `notificarUsuarios` hoje deduplica por `(pedido_id, tipo)` para sempre — um
  segundo aviso do mesmo tipo nunca chegaria. Adicionamos a opção
  `repetivel: true`, que restringe o dedupe às notificações ainda não aceitas
  (mesma proteção contra duplicata na tela, sem silenciar avisos futuros).
- Dois tipos novos, ambos `exige_aceite: true`, destinados ao
  `vendedor_proprietario_id`:
  - `pedido_prazo_alterado` — "Prazo do pedido X foi atualizado para dd/mm/aaaa";
  - `pedido_condicao_alterada` — "Pedido X teve uma condição atualizada pelo
    operacional — confira".
- A condição alterada é disparada quando o operacional muda os campos
  negociados do pedido (modalidade de entrega, transportadora, condição de
  pagamento, frete) — mesma lista já editável na tela de pedidos.
- `AlertaPendente` já leva ao pedido; só entram os rótulos dos dois tipos novos.

## Frente 4 — Duas regras no Xerife de pedidos

Em `src/routes/api/public/hooks/xerife-pedidos.ts`, usando o `criarTarefa`
existente (dedupe por `xerife_log`), com dono = responsável operacional do
pedido (com o mesmo desvio de "isentos" já usado):

- **R-parado**: pedido em `pronto` ou `faturado_em_rota` cujo registro mais
  recente em `pedido_stage_history` tem 2+ dias úteis (via `diasUteisEntre`).
  Regra `pedido_parado`, tipo `pedido_parado`, dedupe 24h.
- **R-a-vencer**: pedido fora das etapas terminais/entregues cujo `prazoEfetivo`
  vence em ≤48h e ainda não venceu. Regra `pedido_prazo_a_vencer`, dedupe 24h.
  Não conflita com `pedido_previsao_atrasada`, que só age depois do vencimento
  (e passa a usar o prazo efetivo também).

## Testes

- `src/lib/pedido-prazo.test.ts`: precedência real/original, atraso, janela 48h.
- Testes das duas regras novas com relógio fixo, incluindo fim de semana nos
  2 dias úteis.
- `bunx vitest run` + `bunx tsgo --noEmit` + build antes de mandar o diff.

## Pontos a confirmar

1. Observação livre entra como ocorrência **já resolvida** (não trava o avanço
   para pós-venda). OK?
2. Prazo real é **data** (sem hora); o aviso de 48h usa o fim do dia do prazo.
3. Manter `pedidos.ocorrencia` como coluna legada por ora, sem remover.
