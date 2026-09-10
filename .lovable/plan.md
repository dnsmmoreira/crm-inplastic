# Manuais por função ("o mundo acabou e começou hoje")

Regra do placar já alterada: o desconto por atendimento escalado agora conta **uma vez por cliente** no período (antes repetia a cada escalação do mesmo cliente). Vale também na comparação com o mês anterior.

## Ideia

Hoje existe um manual único e genérico. A pessoa nova abre e não sabe o que é dela.
A troca: uma **página inicial de manuais** que pergunta "quem é você?" e leva cada
um para o seu próprio manual, escrito como se ninguém pudesse ensinar nada.

## Manuais (um por função, seguindo as funções que existem hoje)

1. **Vendedor** (Beatriz, Bianca, Daniel, Pamela)
2. **Assistente Comercial** (Bruna) — apoio, cadastros, pedidos, romaneios
3. **Financeiro** (Wagner, Renata) — aprovações, faturamento, cobrança
4. **Representação** (Kelly) — canal representante, licitações, comissão
5. **Diretoria / Administrador** (Denis) — equipe, placar, ARENA, configurações

## O que cada manual tem (mesma espinha, conteúdo diferente)

- **Seu primeiro dia**: entrar, trocar a senha, onde fica cada coisa no menu.
- **Sua rotina**: o que abrir de manhã, durante o dia e antes de sair.
- **Suas telas, uma a uma**: para que serve, o que fazer nela, o que NÃO mexer.
- **Passo a passo das tarefas do dia** com números: cadastrar cliente, criar
  proposta, virar pedido, dar baixa em tarefa com desfecho, transferir carteira…
- **"E se…"**: cliente sumiu, cliente reclamou, proposta venceu, pedido atrasou,
  entrou lead que já é de outra pessoa, esqueci a senha.
- **O que o sistema cobra de você**: prazos, tarefas automáticas, avisos do Xerife.
- **Placar** (só onde faz sentido): como pontua, como sobe, o que desconta — já
  com a regra nova de um desconto por cliente.
- **Palavras do sistema** em português simples (lead, proposta, pedido, carteira).

## Como fica na tela

- Novo `public/manuais.html`: capa com os cinco cartões de função.
- Cinco páginas novas: `manual-vendedor.html`, `manual-assistente.html`,
  `manual-financeiro.html`, `manual-representacao.html`, `manual-diretoria.html`.
- Mesmo visual do manual atual (mesma paleta, mesmas caixas, índice lateral,
  barra de leitura), para não parecer outro produto.
- O manual atual continua existindo como "Visão geral do CRM", linkado na capa.
- No menu lateral, "Manual do CRM" passa a abrir a capa de manuais; no desktop e
  no celular. Se der para saber a função da pessoa logada, o cartão dela vem
  destacado em primeiro.

## Detalhes técnicos

- Páginas estáticas em `public/`, sem build e sem dados do banco — abrem mesmo
  para quem ainda não tem acesso ao sistema.
- Conteúdo escrito a partir do comportamento real do código (etapas do funil,
  estágios de pedido, desfechos obrigatórios de tarefa, regras do Xerife, pesos
  do placar), não inventado.
- Único arquivo do app tocado: `src/routes/__root.tsx` (o link do menu).
