# /conversas: botão NOVO + filtro de Filas

## Respostas às 4 perguntas

**1) Já dá para iniciar uma conversa nova?**
Parcialmente. Existe envio direto por número:
- `src/lib/zapi.functions.ts:18` — `sendWhatsapp({ phone, message })` envia texto via Z-API para qualquer número (autenticado).
- `src/lib/zapi-send.server.ts:27` — `sendZapiText()`, caminho único de envio.
- `src/lib/canais.functions.ts:18` — `sendConversaMessage()` só funciona para conversa já existente (`whatsapp_conversas`).

O que **não** existe: nenhuma função que *crie* uma linha em `whatsapp_conversas` a partir de um número novo. Hoje conversas só nascem pelo webhook de entrada (`src/routes/api/public/zapi/webhook.ts`), ou seja, quando o cliente escreve primeiro. Então o botão NOVO tem duas leituras possíveis (ver "Decisão pendente").

**2) "Filas" existe no domínio?**
Não como tabela nem coluna. `src/lib/fila.functions.ts` é a fila de *vendedores* (round-robin), não de conversas. O que dá para usar como fila sem criar tabela:
- `whatsapp_conversas.status` (`ia_atendendo`, `humano_atendendo`, `qualificado`, `encerrado`)
- `whatsapp_conversas.requer_humano` (handoff pendente)
- `whatsapp_conversas.atribuido_para` (minhas / sem dono / de outro vendedor — admin)
- etapa do funil do lead vinculado (`leads.stage`) via `lead_id`

Proposta: "Filas" = combinação de `status` + `requer_humano` + atribuição, apresentada como lista fixa: Todas · IA atendendo · Requer humano · Em atendimento humano · Qualificado · Encerrado (+ "Sem responsável", só admin).

**3) Onde encaixar no `src/routes/conversas.tsx`**
- Botão **NOVO**: cabeçalho, em `src/routes/conversas.tsx:189-196` — transformar o bloco do `<h1>` em flex com o botão à direita (mesma linha do título), coerente com o wAtende.
- Seletor de **Fila**: dentro do bloco de busca, `src/routes/conversas.tsx:201-210` — um `Select` logo abaixo/ao lado do `Input` de busca, acima das abas Aguardando/Atendendo (`:211-235`).
- Filtro aplicado em `filtradas`, `src/routes/conversas.tsx:167-175` (adicionar a condição de fila junto com aba + busca).
- Contadores das abas (`:159-165`) passam a respeitar a fila selecionada, para os números baterem com a lista.

**4) Risco de disparar WhatsApp real**
Sim, é real: `sendWhatsapp` já envia de verdade. Para evitar, o botão NOVO **não** chamará nenhuma função de envio. Ele apenas abre um diálogo de busca entre conversas/contatos já existentes e navega para a conversa (`navigate({ search: { c: id } })`). Nenhuma mensagem sai sem o vendedor digitar e clicar em Enviar no chat, exatamente como hoje.

## Decisão pendente
O botão NOVO deve:
- (a) **Apenas abrir conversa existente** — busca por nome/telefone entre `whatsapp_conversas` (e leads com telefone), navega para o chat. Zero risco, zero backend novo. **Recomendado.**
- (b) **Criar conversa para número novo** — exige uma server fn nova que insira em `whatsapp_conversas` (sem enviar nada). Ainda sem disparo automático, mas mexe no banco.

O plano abaixo assume (a); diga se prefere (b).

## Escopo da implementação (após aprovação)
1. `src/routes/conversas.tsx` — estado `fila` + `Select` no bloco de filtros; aplicar em `filtradas` e nos contadores.
2. Botão NOVO no cabeçalho abrindo um `Dialog` novo (`src/components/atendimento/NovaConversaDialog.tsx`) com busca client-side sobre as conversas já carregadas + leads com telefone; ao escolher, navega para `?c=<id>`.
3. Nenhuma alteração em server functions, banco ou Z-API. `/atendimento-ia` intacto.
