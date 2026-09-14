# Tratativa comercial fica com o vendedor — pedido nasce com a decisão pronta

Quatro frentes ligadas, saindo do incidente PED-2026-0087 (o pedido específico já foi corrigido por SQL e não será tocado).

## 1) Pedido nasce já com modalidade e transportadora

Em `ensurePedidoFromProposta` (`src/lib/pedidos-gerar.functions.ts`), no insert do pedido, derivar da proposta:

- `ehRetirada(transport)` verdadeiro ("Cliente retira" / "Veículo próprio" / `retirada: true`) → `modalidade_entrega = 'entrega_propria'`, `transportadora = null`.
- senão, com `transport.carrier` e/ou `carrierTransportadoraId` definidos → `modalidade_entrega = 'coleta'`, `transportadora` = nome da transportadora (quando só houver id, buscar o nome em `transportadoras`).
- sem nenhum dos dois → grava nulo (não deve acontecer depois da frente 2, mas o pedido não inventa valor).

A regra vira função pura `derivarEntregaDaProposta(transport)` em `src/lib/pedido-entrega.ts`, com testes.

## 2) Sem decisão de entrega, o pedido não é gerado

Em `calcularPendenciasPedido` (`src/lib/pedido-pendencias.ts`), nova pendência bloqueante `sem_transportadora`: quando não é retirada e não há `carrier` nem `carrierTransportadoraId`, a mensagem pede ao vendedor escolher a transportadora ou marcar que o cliente retira. Aparece no `ConferenciaFinalDialog` como as demais e é revalidada no servidor em `gerarPedidoInterno` (que já chama a mesma função com dados do banco).

## 3) A etapa "Coleta / Entrega" não pede mais esse dado ao operacional

- `dadosExigidosParaEntrar('pronto')` passa a devolver `[]`; `faltamDados` deixa de produzir formulário para modalidade/transportadora.
- Novo guard em `updatePedidoStage`: ao entrar em `pronto`, se o pedido (legado) estiver sem modalidade e sem transportadora e não for retirada, o avanço é recusado com motivo `dado_comercial_faltando` e mensagem explicando que falta decisão comercial e que o pedido precisa ser devolvido ao vendedor. A tela mostra o aviso com o botão de devolução já existente (`devolverPedidoOperacional`), sem abrir campo de preenchimento.

## 4) Trava de edição por papel

### Classificação dos campos hoje editáveis no pedido

COMERCIAL — bloqueado para quem só é operacional:

| Campo / ação | Onde está hoje |
| --- | --- |
| `transportadora` | `PrazoCondicaoBlock` → `atualizarCondicaoNegociada` |
| `modalidade_entrega` | `atualizarCondicaoNegociada`, `setModalidadeEntrega`, formulário de avanço |
| cliente, condição de pagamento, itens, valores, desconto/acréscimo, endereço de entrega | hoje já são somente leitura no pedido (vêm do snapshot) — ficam formalmente marcados como comerciais para não abrirem no futuro |

OPERACIONAL — segue liberado para quem opera produção:

| Campo / ação | Onde está hoje |
| --- | --- |
| `prazo_real_entrega` + motivo | `definirPrazoRealEntrega` |
| status fiscal, número/série/chave da NF, datas de faturamento | `atualizarStatusFiscal` |
| checklist de conferência | `salvarChecklistConferencia` |
| ocorrências (abrir/resolver) e observações de logística/faturamento | `registrarOcorrencia`, `resolverOcorrencia` |
| comprovação de entrega, pós-venda, romaneios | blocos já existentes |
| mover etapa, assumir/liberar | `updatePedidoStage`, `assumirPedidoOperacional` / `liberarPedidoOperacional` — sem mudança |

### Como travar

- Função pura nova `podeEditarComercialPedido({ isAdmin, isVendedorDono })` em `src/lib/pedidos-papeis.ts`, com testes: admin sempre pode; vendedor dono do pedido (`vendedor_proprietario_id` ou `owner_id`) pode; qualquer outro (inclusive quem tem `pedidos.operar_producao` e `pedidos.movimentar`) não pode.
- Servidor: `atualizarCondicaoNegociada` e `setModalidadeEntrega` passam a resolver o papel de quem chama e recusam a chamada quando o campo alterado é comercial e a pessoa não tem direito — a recusa é no handler, não só na UI. `definirPrazoRealEntrega` e os demais operacionais continuam só com `exigirMovimentar`.
- Tela: `getPedidoDetalhes` devolve `pode_editar_comercial`; o `PedidoDetailBody` divide o bloco atual em "Prazo (operacional)" e "Condição comercial", esse último desabilitado e em somente leitura para o operacional, com nota curta de que a alteração é do vendedor.

## Detalhes técnicos

- Arquivos: `src/lib/pedido-entrega.ts` (novo), `src/lib/pedido-pendencias.ts`, `src/lib/pedido-avanco.ts`, `src/lib/pedidos-papeis.ts` (novo), `src/lib/pedidos-gerar.functions.ts`, `src/lib/pedidos.functions.ts`, `src/components/pedidos/PedidoDetailDrawer.tsx`, `src/routes/pedidos.tsx`, `src/components/propostas/ConferenciaFinalDialog.tsx`.
- Sem migração de banco: os campos já existem; pedidos legados não são preenchidos em massa (frente 3 os intercepta na etapa).
- Testes novos: derivação de entrega da proposta, pendência `sem_transportadora`, `dadosExigidosParaEntrar('pronto')` vazio, guard de etapa legado, matriz de papéis.
- Ao final: `bunx vitest run` + `bunx tsgo --noEmit`, diff completo para revisão, sem publicar e sem tocar no PED-2026-0087.
