# Fechar o buraco que causou os pedidos 2WE e NEWCARE

Três frentes, sem publicar nada: trancar a edição de proposta já virada em pedido,
unificar a devolução em qualquer etapa e avisar o vendedor com pop-up.

## 1) Proposta convertida deixa de ser editável

Hoje `/propostas/$id` considera a proposta somente-leitura quando virou pedido,
mas um "desbloquear edição" do ADM contorna isso — e a edição liberada grava num
lugar que o pedido não lê. Passa a valer:

- Proposta com situação "pedido" fica sempre somente-leitura, sem exceção.
- Os botões "Desbloquear edição", "Solicitar alteração", "Liberar/Recusar
  alteração" e "Re-bloquear" somem nesse estado.
- No lugar deles, um aviso fixo: "Esta proposta virou o pedido PED-XXXX. Para
  alterar, devolva o pedido — a proposta volta a ficar editável."
- O aviso leva direto ao pedido correspondente.
- Nenhum dado histórico é alterado; propostas ainda não convertidas continuam
  como estão.

## 2) Uma só devolução, disponível em qualquer etapa

Um único trecho de código compartilhado (`src/lib/pedidos-devolucao.server.ts`)
passa a executar a devolução, e as duas ações existentes (recusa do financeiro e
devolução operacional) passam a chamá-lo. Comportamento idêntico nos dois casos:

- motivo obrigatório, mínimo 3 caracteres;
- pedido encerrado com o motivo gravado no histórico de etapas;
- proposta desvinculada (o retrato do pedido é preservado para auditoria) e
  reaberta como "enviada", editável;
- lead volta para "proposta";
- tarefas abertas do pedido encerradas;
- aviso ao vendedor (item 3).

Botão "Devolver / cancelar pedido" passa a aparecer em **toda etapa não
terminal** — hoje aparece só em Liberado, Em Produção, Coleta/Entrega e
Faturado/Em Rota; passa a incluir Análise Financeira, Aguardando Pagamento e
Pós-venda em aberto. Etapas já encerradas (cancelado, reprovado, pós-venda
fechado) não mostram o botão.

**Ponto que preciso confirmar contigo:** a recusa do financeiro hoje termina na
coluna própria "Reprovado Financeiro", que aparece em relatórios. Vou manter esse
destino para a recusa feita na análise financeira (com exatamente os mesmos
efeitos da devolução) e usar "Cancelado" para as demais etapas. Se preferir que
tudo caia em "Cancelado" e a coluna "Reprovado Financeiro" deixe de ser usada, me
avisa que troco.

## 3) Pop-up para o vendedor, não só o sino

A devolução já cria uma notificação com aceite obrigatório; o que falta é ela
aparecer como pop-up com texto e destino certos:

- Texto: "Pedido PED-XXXX foi devolvido. Motivo: {motivo}. A proposta {número}
  está editável novamente em Propostas — corrija e reenvie."
- Botão "Aceitar" leva direto à proposta reaberta.
- Enquanto não for aceito, reaparece a cada 10 minutos, igual aos avisos
  financeiros de hoje.

## Detalhes técnicos

- Novo módulo `src/lib/pedidos-devolucao.server.ts` com `devolverPedidoCore(sb, {
  pedidoId, motivo, userId, stageDestino })`; `reprovarPedidoFinanceiro` e
  `devolverPedidoOperacional` viram cascas finas (permissão + etapa válida) sobre
  ele, preservando as mensagens de erro e o padrão "registrar e seguir" do
  histórico e "abortar" do rollback proposta/lead.
- `podeDevolverPedido` em `src/lib/pedidos-stages.ts` passa a significar "etapa
  não terminal"; testes ajustados.
- Migração pequena: coluna `proposta_id` em `notificacoes` (mais índice), para o
  pop-up saber para qual proposta levar. Sem mudança de RLS/policy.
- `useAlertasPendentes` passa a ler `proposta_id`; `AlertaPendente.tsx` ganha o
  texto de `pedido_cancelado`/`pedido_reprovado` e navega para
  `/propostas/$id` quando houver proposta.
- `src/routes/propostas.$id.tsx`: `readOnly = isPedido`, remoção dos caminhos de
  destravamento e do aviso novo.
- Suíte completa + verificação de tipos antes de te mandar o diff. Nada publicado.
