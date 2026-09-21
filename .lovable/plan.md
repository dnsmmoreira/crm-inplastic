# Isolar a Maxicaixa da INPLASTIC

## Como foi verificado

Entrei no sistema com as contas reais (Lais e Carol) e medi, tela por tela, o que cada uma
enxerga hoje. Não é estimativa: é o que apareceu na tela e o que o banco devolveu para o
login delas.

## Varredura — o que vaza hoje

| Tela / recurso | Vaza? | Por quê |
| --- | --- | --- |
| Início (dashboard) — card Placar | **SIM** | O placar é montado por uma rotina do banco que roda com poderes elevados e não olha equipe. Lais vê BIANCA, DANIEL, BEATRIZ, PAMELA. |
| Início — pipeline, faturamento, conversão, funil, mix, tendência, tarefas, agenda | Não | Tudo zerado para a Lais: as regras de acesso por dono/equipe funcionam. |
| Placar de Vendedores (`/placar`) | **SIM** | Mesma rotina do card. Ranking completo da INPLASTIC, com valores fechados. |
| Chat Interno | **SIM** | Os 5 da Maxicaixa estão no canal "Grupo Comercial" (li as mensagens internas da INPLASTIC na tela da Lais) e a lista de conversas diretas oferece as 13 pessoas da empresa. Causa: o gatilho que põe todo mundo no mesmo grupo e a rotina que lista colegas sem filtrar equipe. |
| WhatsApp — `/conversas` e `/atendimento-ia` | **SIM, e é o pior caso** | O perfil Vendedor tem a permissão de atender WhatsApp, e a regra de acesso libera **todas** as conversas para quem tem essa permissão. Medido com a conta da Carol: **231 conversas e 3.381 mensagens** de clientes da INPLASTIC. Lais não tem essa permissão, por isso vê zero — mas Carol, Bertuolo, Luciano e Kelly Maxicaixa veem tudo. |
| Pendências de cadastro (`/pendencias`) | **Não vaza hoje** | Abri a tela logada como Lais: todas as seções em 0. A consulta usa o acesso da própria pessoa e as regras de equipe bloqueiam. Os 102 leads de Daniel/Beatriz não apareceram para ela. Provavelmente o que foi visto era a tela de um administrador. Ainda assim vamos amarrar o escopo explícito, como pedido. |
| Funil de vendas, Leads, Clientes, Propostas, Pedidos, Contatos, Fichas de Coleta, Tarefas, Minha Agenda, Relatórios | Não | Todos vazios para a Lais — regras por dono/equipe cobrem. |
| `/equipe` | Não vaza, mas **trava** | Fica em "Carregando a equipe…" para sempre, porque a Lais não tem liderados e a função recusa o acesso sem mensagem. |
| Representantes, Licitações, ARENA | Não | Bloqueiam por permissão, com aviso correto. |
| Notificações (sino) | Não | Cada pessoa só vê as próprias. |
| Estoque / catálogo de produtos | Vê o catálogo da INPLASTIC (98 itens) | Catálogo é liberado para qualquer pessoa logada. **Precisa de decisão sua** (ver abaixo). |
| Transportadoras (6), lista de equipes (3), condições de pagamento, tabela DIFAL | Vê tudo | Cadastros compartilhados, liberados para qualquer pessoa logada. **Decisão sua.** |
| Busca global | Não existe no sistema | — |

## O que vamos fazer

### 1. Placar por equipe
A rotina do placar passa a usar a equipe de quem está olhando: quem tem visão de empresa
(administrador ou permissão de ver tudo) continua vendo todo mundo; quem é de uma equipe vê
só os vendedores da própria equipe. Vale para o card do Início e para a tela do placar.

**Como fica a Maxicaixa:** hoje nenhum dos 5 está inscrito na ARENA, então o placar deles
fica **vazio** — e é isso que queremos, em vez da INPLASTIC. Estado vazio proposto:
"O placar da sua equipe ainda não está ativo. Fale com a gestão para entrar na ARENA." —
sem tabela, sem pódio, sem número de outra equipe.

### 2. Chat Interno
- Criar o grupo "Grupo Maxicaixa" e colocar os 5 nele.
- Tirar os 5 da lista de membros do "Grupo Comercial" (só a participação; **nenhuma mensagem
  é apagada**).
- O gatilho de entrada automática passa a colocar a pessoa no grupo da própria equipe
  (cada equipe ganha o seu grupo; quem não tem equipe não entra em grupo nenhum).
- A lista de conversas diretas passa a mostrar: colegas da mesma equipe **+ o gestor da
  pessoa**. Abrir conversa direta com quem está fora dessa lista passa a ser recusado.
- O painel de supervisão do Denis continua vendo tudo, sem mudança.

### 3. WhatsApp (novo achado, mais grave)
A liberação de conversas deixa de ser "tem permissão de atender → vê tudo" e passa a ser
"tem permissão de atender **e** a conversa é da própria equipe" (pelo dono do lead ou pelo
responsável da conversa), com visão de empresa preservada para administradores. Mesma regra
para as mensagens.

### 4. Pendências de cadastro
Passa a usar o mesmo escopo de três estados dos Relatórios (empresa / equipe / próprio),
filtrando explicitamente por dono, além das regras do banco.

### 5. `/equipe`
Trocar o carregamento infinito por um aviso claro quando a pessoa não tem equipe sob sua
responsabilidade.

## Decisão sua antes de implementar

1. **Catálogo, estoque, transportadoras, condições de pagamento e DIFAL**: hoje a Maxicaixa
   vê tudo da INPLASTIC. Separo também (cada equipe com o seu), deixo compartilhado, ou só o
   catálogo de produtos fica compartilhado?
2. **Lista de equipes**: a Maxicaixa consegue ver que existem 3 equipes (só os nomes). Ocultar?

## Detalhes técnicos

- `placar_vendedores` e `ganhos_fora_do_placar` (SECURITY DEFINER) ganham filtro por
  `profiles.equipe_id` do `auth.uid()`, com bypass para `has_role(admin)`, permissão
  `pedidos.ver_todos` ou `supervisor_ve_tudo`.
- `chat_canais` ganha `equipe_id`; `tg_profiles_entra_no_grupo_comercial` passa a resolver o
  canal pelo `equipe_id` do profile; `chat_listar_colegas` filtra por `mesma_equipe` +
  `gestor_id` + `chat_supervisor_id()`; `chat_obter_ou_criar_canal_direto` valida a mesma
  regra antes de criar o canal. `DELETE` só em `chat_canal_membros` — nunca em
  `chat_mensagens`.
- Policies `conversas select atendentes` e `mensagens select atendentes` passam a exigir
  `mesma_equipe(auth.uid(), <dono do lead ou atribuído>)` além da permissão.
- `listarPendenciasCadastro` usa `resolverEscopo` (chaves `leads.ver_todos` /
  `leads.ver_equipe`) e aplica `in(owner_id, ...)` conforme o escopo.
- Testes: casos de regressão para o filtro do placar, para a lista de colegas do chat e para
  o escopo de pendências; e um teste que roda contra o banco conferindo que nenhum membro da
  Maxicaixa é membro do Grupo Comercial.
- Entrego typecheck, suíte e build com a saída real. Não publico nada.
