# Diagnóstico: o que dá para melhorar agora

Levantamento feito com os alertas de monitoramento do sistema, as consultas mais
pesadas do banco (últimos dias) e uma varredura do código. Abaixo, priorizado por
impacto real, nas três frentes que você escolheu.

## Prioridade 1 — Confiabilidade (risco de prejuízo hoje)

**1.1 Proposta salva pela metade (confirmado no banco).**
Quem tem permissão de "ver todas as propostas" mas não é o dono consegue abrir e
editar a proposta, mas o banco recusa a gravação dos **produtos** e das
**parcelas**. Aconteceu várias vezes em 28/08. O usuário acha que salvou; o
cliente recebe proposta sem itens.
Conferi as regras: a leitura foi ampliada para "ver todas", mas a regra de
gravação dos itens/parcelas continua exigindo ser o dono ou admin.
Correção: alinhar a regra de gravação à de edição e, na tela, bloquear o
"salvo com sucesso" quando qualquer parte falhar.

**1.2 Boas-vindas do WhatsApp bloqueada pela própria trava anti-spam.**
Lead novo que chega pela integração externa não recebe a mensagem de abertura
quando cai na trava de 20 segundos ou de mensagem repetida em 10 minutos. O lead
é criado e distribuído, mas ninguém percebe que a conversa nunca começou.
Correção: variar/personalizar o texto, nova tentativa com espera e um aviso
visível ao vendedor quando mesmo assim não sair.

**1.3 Recarga de tela pode esvaziar a lista em silêncio.**
Quando o sistema recarrega leads, tarefas e propostas (a cada evento ou a cada
10 minutos), uma falha de rede ou de permissão não é detectada: a lista volta
vazia e substitui o que estava na tela.
Correção: verificar a falha, manter o que já estava carregado e avisar.

## Prioridade 2 — Velocidade no dia a dia

O banco hoje é pequeno (255 leads, 158 propostas, 91 pedidos), então a lentidão
**não é volume de dados — é volume de chamadas repetidas**:

- As mensagens do WhatsApp respondem por ~32 minutos de banco por período, com
  246 mil chamadas: as telas de conversa recarregam a conversa inteira a cada
  atualização, em vez de buscar só o que chegou de novo.
- O histórico da IA e as interações do lead são lidos **por inteiro** 22 mil
  vezes cada — sem filtro e sem limite.
- Propostas, itens e parcelas são recarregados por completo a cada evento.
- As telas de leads e pipeline "paginam" apenas visualmente: tudo já foi
  carregado antes.

Ações propostas, em ordem de retorno:
1. Conversas: buscar só mensagens novas (a partir da última recebida) e limitar o
   histórico inicial.
2. Histórico da IA e interações: filtrar por lead e por período, com limite.
3. Recarregar só o registro que mudou, não a coleção inteira.
4. Leads e pipeline: paginação de verdade no servidor, como já é feito em
   Clientes.

## Prioridade 3 — Visão de gestão

O que já existe está bom: o Placar cobre ranking, metas, conversão, tempo de
primeira resposta, SLA e carteira em atraso. O que falta para decisão:

- **Funil com tempo por etapa** e conversão etapa a etapa (hoje só o total).
- **Previsão de fechamento** do mês: valor em negociação ponderado por etapa.
- **Relatório financeiro por período**: receita realizada x meta, ticket médio,
  comparativo entre vendedores — hoje /relatorios é só lista de pedidos.
- **Motivos de perda consolidados** por período, produto e vendedor.
- **Carga de trabalho por vendedor**: tarefas abertas, vencidas e concluídas.

## Como sugiro tocar

Etapa A (agora): itens 1.1, 1.2 e 1.3 — são falhas que já causaram problema.
Etapa B: os quatro itens de velocidade, começando pelas conversas.
Etapa C: os indicadores de gestão, escolhendo quais você quer primeiro.

## Detalhes técnicos

- 1.1: policies `prop_itens via proposta` / `parcelas via proposta` (FOR ALL,
  `owner_id = auth.uid() OR has_role admin`) contra a policy de SELECT
  `tem_permissao(..., 'propostas.ver_todas')` — migration 20260818123608.
  Escrita em `src/lib/crm-sync.ts:1011,1064`.
- 1.2: `src/routes/api/public/hooks/lead-externo.ts:249-263` e travas em
  `src/lib/whatsapp-send.server.ts:396-404,431-440`.
- 1.3: `loadAll` (`crm-sync.ts:721-745`) e `recarregarColecao` (`:1246-1333`)
  desestruturam só `{ data }`; `resyncAgora` (`:1352`) só faz `console.warn`.
- Velocidade: `whatsapp_mensagens` 173k+73k chamadas; `lead_ai_actions` e
  `lead_interactions` 22k chamadas cada, sem `WHERE lead_id`; `queryLeads`,
  `queryTarefas`, `queryPropostas` sem `.range()/.limit()`; paginação
  client-side em `leads.tsx:78,134` e `pipeline.tsx:682,910`; padrão bom em
  `clientes.index.tsx:70,84-94`.
- Extra: `frases-prontas.functions.ts:208-217` e `atendimento.functions.ts:277-287`
  fazem UPDATE em laço, sem lote nem atomicidade.
