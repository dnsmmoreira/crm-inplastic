# Ficha de Coleta — arquitetura proposta

Módulo novo de autorização de coleta, sempre nascido de um pedido, com numeração
própria, congelamento de dados na emissão, histórico e impressão.

## Correção de um ponto do briefing (verificado no banco)

O item 6 diz que não existe cadastro de empresa. **Existe**: a tabela `emitters`
(razão social, CNPJ, IE, endereço, telefone, WhatsApp, e-mail, site, dados
bancários, marca padrão) já alimenta a tela **Empresas do grupo** (`/empresas`,
restrita a `empresas.editar`) e é a fonte do cabeçalho das propostas.

Proposta: **não criar tabela nova de empresa**. Em vez disso, acrescentar a
`emitters` os campos que faltam para a ficha — contato padrão (nome + telefone,
pré-preenchido com "Bruna" / "(11) 2574-1360") e endereço de coleta/remetente
quando diferente do fiscal. Cada linha de `emitters` já é uma unidade, então
"mais de uma filial no futuro" já está contemplado sem mudança de modelo. A tela
`/empresas` ganha esses campos numa seção "Coleta / expedição".

Se você preferir mesmo uma tabela separada de unidades, diga — mas duplicaria
razão social/CNPJ/endereço que já existem.

## Tabelas novas

**`fichas_coleta`**
- `numero` (COL-AAAA-NNNNNN, único), `pedido_id`, `emitter_id`
- `status`: rascunho | emitida | em_coleta | coletada | cancelada
- transportadora (`transportadora_id` + nome congelado), `modalidade_entrega`
- contato responsável (nome, telefone) — default vindo do emitter, editável
- campos manuais: previsão de data/horário de coleta, observações de
  carregamento, motorista, placa, volumes/embalagem
- `snapshot` JSONB (preenchido na emissão), `emitida_em/_por`,
  `coletada_em/_por`, `cancelada_em/_por`, `cancelamento_motivo`
- `peso_total_kg`, `cubagem_m3` (calculados, congelados no snapshot)
- `created_by`, `created_at`, `updated_at`

**`ficha_coleta_itens`** (só enquanto rascunho; depois vale o snapshot)
- `ficha_id`, `produto_id`, sku/descrição, quantidade, unidade
- `peso_kg`, `cubagem_m3`
- `peso_manual` / `cubagem_manual` (boolean) — marca "informado manualmente",
  para o fallback quando `produtos.weight_kg` ou as dimensões vierem zeradas

**`ficha_coleta_historico`** (espelho de `pedido_ocorrencias`)
- `ficha_id`, `tipo` (criada, editada, status, impressa, cancelada), `descricao`,
  `status_anterior`, `status_novo`, `criada_por`, `created_at`

Todas com GRANT explícito + RLS: leitura/escrita para quem já pode ver o pedido
(vendedor dono, `pedidos.operar_producao`, `pedidos.movimentar`,
`pedidos.ver_todos`, admin) — o escopo amplo do item 14, não a trava comercial.

## Colunas novas em `transportadoras`

`cnpj`, `razao_social`, `ie`, endereço (cep/logradouro/número/bairro/cidade/uf),
telefone, e-mail, `abrangencia_ufs text[]`. A busca por CNPJ reaproveita
`consultarCnpj` de `src/lib/cnpj.functions.ts` (CNPJá), a mesma usada em clientes
e leads — sem nova integração. "Abrangência" vira multi-select de UFs.

## Função de numeração

`public.next_ficha_coleta_number(_year int)` SECURITY DEFINER, cópia fiel de
`next_pedido_number`: `pg_advisory_xact_lock`, MAX do sufixo, `lpad(...,6,'0')`,
prefixo `COL-AAAA-`, EXECUTE revogado de PUBLIC/anon. Número gerado na **criação
do rascunho** e nunca reaproveitado — cancelar não libera o número.

## Lifecycle e imutabilidade

rascunho → emitida → em_coleta → coletada; cancelada a partir de qualquer uma
antes de coletada. Só rascunho é editável. Na transição rascunho→emitida o
servidor monta o snapshot (pedido, cliente, endereço de entrega, itens com peso
e cubagem, transportadora, vendedor, emitente, contato) e a partir daí toda
leitura/impressão usa o snapshot — o pedido pode mudar, a ficha impressa não.
Regras puras em `src/lib/ficha-coleta.ts` (transições válidas, cálculo de peso e
cubagem, detecção de dado faltante → fallback manual) com testes.

## Telas e rotas

- `/fichas-coleta` — lista com filtro por status/período/transportadora
- `/fichas-coleta/$id` — detalhe: editar (rascunho), emitir, imprimir, marcar em
  coleta / coletada, cancelar, aba de histórico
- `/ficha-coleta/$id/imprimir` — página de impressão no padrão do
  `romaneio/$pedidoId/$tipo` (bloco `@media print`, A4, sem lib de PDF)
- `/ficha-coleta-publica/$id` — consulta pública somente leitura, padrão de
  `proposta-publica.$id`, destino do QR code
- `PedidoDetailDrawer` ganha "Gerar Ficha de Coleta" + lista das fichas do pedido
- `/transportadoras` ganha os campos novos e o botão de buscar por CNPJ
- `/empresas` ganha a seção "Coleta / expedição"
- Item de menu em Cadastro/Operação conforme a matriz de visibilidade já existente

## Dependência nova

`qrcode.react` (leve, sem binário) — única lib adicionada, só para o QR do PDF.

## Detalhes técnicos

- Server functions em `src/lib/ficha-coleta.functions.ts` com
  `requireSupabaseAuth`; o guard de acesso resolve o papel no servidor
  (reaproveitando o resolvedor já usado em `pedidos.functions.ts`) e rejeita
  update em ficha não-rascunho independentemente do papel.
- A rota pública lê por um server fn público com projeção reduzida (sem valores
  financeiros) e policy `TO anon` restrita ao snapshot da ficha emitida.
- Peso/cubagem: `produtos.weight_kg`, `height_cm`, `width_cm`, `length_cm`;
  zero ou nulo conta como ausente e exige entrada manual, marcada como tal na
  ficha e no histórico.
- Migrações em PT-BR, GRANT + RLS em toda tabela nova, sem tocar em
  `pedidos`/`propostas`/`produtos` além de leitura.
- Ao final: `bunx vitest run` + `bunx tsgo --noEmit` e diff completo, sem publicar.

## Ordem de implementação sugerida

1. `emitters` (contato/coleta) + tela `/empresas`
2. `transportadoras` (CNPJ, endereço, abrangência) + tela
3. Tabelas da ficha, numeração, RLS, puras + testes
4. Server functions e lifecycle
5. Telas de lista/detalhe e botão no pedido
6. Impressão, rota pública e QR code
