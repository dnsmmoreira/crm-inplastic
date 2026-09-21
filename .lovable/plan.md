# Lais e Ana Claudia podem cadastrar leads e clientes

Objetivo: as duas passam a cadastrar leads e clientes da Maxicaixa, sem ganhar nenhuma visão nova e sem mudar nada para quem já cadastra hoje.

## 1. Levantamento — como está hoje

### Quem vê as telas (menu lateral, `src/routes/__root.tsx`)
- Regra `vendas` = é administrador **ou** tem `propostas.editar`. Ela controla **Funil de Vendas** e **Leads**.
- Regra `vendasOu("clientes.ver_todos")` controla **Clientes**, Contatos, Empresas, Produtos, Transportadoras.
- Lais (Supervisor ADM) e Ana (Auditor Xerife) não têm `propostas.editar` nem `clientes.ver_todos` → hoje **não enxergam Leads, Funil nem Clientes** no menu, mesmo tendo `leads.ver_equipe` e `clientes.ver_equipe`.

### Onde aparecem os botões de cadastro
| Ponto | Regra atual |
|---|---|
| Início (`/`) — botão "Novo lead" | **sem nenhuma regra**: aparece para todo mundo que abre o painel |
| Funil (`/pipeline`) — botão "Novo" | sem regra própria; depende de chegar na tela (regra `vendas`) |
| Clientes (`/clientes`) — botão "Novo cliente" | **sem nenhuma regra**; depende de chegar na tela |
| Propostas — "Cadastrar novo lead" e "Novo cliente" dentro do fluxo da proposta | sem regra própria |
| Ficha do lead — cadastro de cliente a partir do lead | sem regra própria |
- Não existe tela de importação de leads/clientes no sistema.

### Server functions de criação
- **Cliente:** `createCliente` / `criarClienteCore` (`src/lib/clientes.functions.ts`) — exige apenas estar autenticado. Grava `vendedor_id = quem criou` e `criado_por = quem criou`.
- **Lead:** não há função de criação; o lead é gravado direto pelo navegador (`crm-sync.ts`, `upsert` em `leads`), protegido só pela RLS `leads owner insert`.
- **Nenhuma** das duas recusa por papel, por `limite_leads_simultaneos = 0` ou por `xerife_isento`. Esses dois campos não são lidos em nenhum caminho de criação.

### Conclusão do levantamento
Hoje o que separa quem cadastra de quem não cadastra é **conseguir abrir a tela** — não existe permissão de cadastro. Por isso as duas não conseguem, embora o banco já aceite o insert delas.

## 2. Proposta — permissões `leads.criar` e `clientes.criar`

Seguir o padrão atual (chaves na tabela de permissões + perfis):
- Criar as chaves `leads.criar` (grupo leads) e `clientes.criar` (grupo clientes).
- Dar as duas aos perfis **Supervisor ADM** e **Auditor Xerife**.
- Dar também a todos os perfis que hoje já cadastram, para ninguém perder nada: **Administrador**, **Gestor Comercial**, **Vendedor** (ambas) e **Operacional** (`clientes.criar`, pois hoje já alcança a tela de Clientes). Financeiro fica de fora — hoje não alcança nenhuma das telas.
- Menu: **Leads** passa a `vendas` ou `leads.ver_equipe`/`leads.criar`; **Clientes** passa a aceitar também `clientes.ver_equipe`/`clientes.criar`. Funil, Contatos, Empresas, Produtos e Transportadoras **não mudam** — as duas seguem sem esses itens.
- Botões: os quatro pontos de cadastro passam a exigir a chave correspondente. Como todos os perfis que hoje cadastram recebem a chave, ninguém perde botão.
- Servidor: `createCliente` passa a exigir `clientes.criar`; o caminho de lead ganha a mesma checagem no ponto em que o lead novo é salvo. A regra de banco continua igual (dono = quem cria).
- Testes de não-regressão: para cada perfil existente, provar que continua vendo e usando os mesmos botões de antes.

## 3. Vazamento na checagem de duplicidade

**Como é hoje:** `verificarContatoEntrada` (`src/lib/contato-entrada.functions.ts`) roda com o cliente **administrativo** (ignora todas as regras de acesso) e devolve `leadId`, `clienteId`, `vendedorId`, **`vendedorNome`** e **`empresa`**. A ficha do lead mostra literalmente: *"Este contato já é de FULANO (EMPRESA X)"*. Isso expõe dados da INPLASTIC para quem é da Maxicaixa.
Já a checagem de cliente por CNPJ usa a função de banco `cnpj_status`, que devolve só sinalizadores (existe / ativo / é do mesmo vendedor) — essa não vaza nome nem dono.

**Correção:** a resposta de duplicado passa a ser dividida em dois casos:
- registro **da mesma equipe** (ou de quem o usuário já enxerga): mantém nome do dono e empresa, como hoje;
- registro **de outra equipe**: devolve apenas o sinal de duplicado, sem `vendedorNome`, sem `empresa`, sem `leadId`/`clienteId`/`vendedorId`, e a mensagem vira *"Já existe cadastro deste CNPJ. Fale com o administrador."*
O mesmo corte vale para o aviso de "nome parecido", que hoje devolve o nome da empresa encontrada.
Teste: Ana cadastrando um CNPJ que é de um vendedor da INPLASTIC recebe só a mensagem genérica; um vendedor da INPLASTIC cadastrando um CNPJ de colega da própria equipe continua vendo o nome do dono.

## 4. Dono do registro, fila e Xerife

- **Dono:** quem cadastra vira dono — já é assim (lead grava `owner_id` = quem salva; cliente grava `vendedor_id` e `criado_por`). Nada muda.
- **Fila de distribuição:** a fila é uma lista à parte, alimentada só na tela de usuários. Hoje ela tem 4 pessoas (Beatriz, Bianca, Daniel, Pamela) — nenhuma da Maxicaixa. Cadastrar lead **não** inscreve ninguém na fila. Confirmado.
- **Xerife e Ana:** o Xerife ignora tarefas de quem é isento, e Ana está marcada como isenta — ela não será cobrada. Confirmado.
- **Xerife e Lais:** Lais **não** é isenta. Se ela cadastrar um lead, as cobranças do Xerife passam a valer para ela. Duas saídas: marcar Lais como isenta, ou deixar como está e ela ser cobrada como qualquer dono de lead. **Preciso da sua decisão** — o plano assume "deixar como está" se você não disser o contrário.

## 5. Nada muda para a INPLASTIC

Nenhuma permissão é removida, nenhuma regra de visão é alterada, nenhum dado é migrado. As duas continuam enxergando só Maxicaixa, pelas regras de equipe que já existem.

## Verificação antes de entregar
- Provas no banco entrando como Lais, Ana, um vendedor INPLASTIC e o admin: quem vê cada botão, o que a checagem de duplicado devolve em cada caso, contagens de leads/clientes visíveis antes e depois (devem ser idênticas).
- Saída real de `bunx tsgo --noEmit`, `bunx vitest run` e `bun run build`.
- Nada publicado.
