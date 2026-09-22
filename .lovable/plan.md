# Mostrar o dono quando o cadastro já existe

Hoje, quando alguém tenta cadastrar um CNPJ que já existe em outra equipe, a mensagem é "Fale com o administrador" e o vendedor fica sem saber com quem falar. Passa a aparecer sempre o nome do dono e a equipe dele — e nada além disso.

## Mensagens novas

- Existe e tem dono ativo: `Já existe cadastro deste CNPJ. Dono: DANIEL F. MOREIRA (Equipe INPLASTIC). Fale com ele antes de seguir.`
- Existe e o dono é da mesma equipe (ou quem consulta enxerga o registro): mesma frase, acrescentando o nome da empresa cadastrada, como hoje.
- Existe sem dono, ou o dono está inativo/excluído: `Já existe cadastro deste CNPJ, sem vendedor responsável. Fale com o administrador.`
- Não existe: nada muda, cadastro segue livre.
- Limite de consultas estourado: `Não foi possível verificar agora. Tente novamente em instantes.`

Nunca aparecem: razão social do registro de outra equipe, contatos, telefone, e-mail, valores, propostas, pedidos, histórico ou identificadores. O acesso ao registro continua exatamente como é hoje.

## Onde muda

| Ponto | Hoje | Passa a ser |
| --- | --- | --- |
| Novo lead (Início, Funil, ficha do lead) | entre equipes: "Fale com o administrador" | nome do dono + equipe; empresa só para quem já enxerga |
| Aviso de nome parecido | entre equipes: genérico | nome do dono + equipe; nome da empresa só para quem enxerga |
| Novo cliente (tela de Clientes, propostas, a partir do lead) | "Já existe um cliente com este CNPJ." | acrescenta dono + equipe |
| Cliente inativo de outra pessoa | "Peça a um admin para reativar" | acrescenta dono + equipe |
| Consulta de CNPJ na Receita (botão "Buscar dados") | só traz os dados públicos | passa a avisar, junto, se já existe cadastro e de quem é |
| Busca de clientes por documento | lista só o que a pessoa pode ver | acrescenta um aviso acima da lista quando o documento existe fora do alcance dela |
| Busca por CPF (pessoa física) | mesma checagem do CNPJ | mesmo aviso |
| Telefone e e-mail | já checados na entrada de contato (lead) | mesmo tratamento: dono + equipe |

O cadastro continua bloqueado em todos esses casos — mostrar o dono não libera criar duplicata. A regra que recusa a duplicata não é tocada.

## Botão "Avisar o dono"

A regra atual do chat interno só permite conversa entre pessoas da mesma equipe (ou com o supervisor/gestor). Então:

- Mesma equipe: aparece o botão "Avisar o dono", que abre o chat com ele já com a mensagem pronta "Oi, o cliente CNPJ X está com você? Tenho um contato dele."
- Equipes diferentes: o botão não aparece; fica só o nome e a equipe.

Sem mudar a regra de quem pode conversar com quem.

## Segurança

- Resposta vinda de uma única função no servidor, com acesso privilegiado, devolvendo apenas `{ existe, dono_nome, dono_equipe, sem_dono, empresa? }` — o `empresa` só quando a pessoa já enxerga o registro pela regra de visibilidade atual.
- Limite de 30 consultas por minuto por pessoa; acima disso a resposta é genérica e não revela dono.
- Toda consulta que revela um dono de outra equipe fica registrada na trilha de auditoria: quem consultou, o documento e quando.

## Detalhes técnicos

- `src/lib/contato-entrada.functions.ts`: `verificarContatoEntrada` deixa de zerar o dono quando `podeVerDono` é falso — passa a devolver `donoNome` + `donoEquipe` sempre, e mantém `empresa`/`leadId`/`clienteId` só quando `podeVerDono` é verdadeiro. Novo campo `semDono` quando `owner_id` é nulo ou o perfil está `ativo=false`/`deleted_at`.
- Nome e equipe resolvidos no servidor com service role (`profiles` + `equipes`), nunca pelo cliente.
- `cnpj_status` (as duas versões) permanece como está — não expõe dono. A revelação do dono passa por uma nova função de servidor `consultarDonoDocumento` (CNPJ, CPF, telefone ou e-mail), reutilizada por lead, cliente, consulta de CNPJ e busca.
- `criarClienteCore` (`src/lib/clientes.functions.ts`) chama essa função ao montar as mensagens `duplicate_other` e `duplicate_inactive`.
- Consumidores de tela: `NewLeadDialog` em `LeadDrawer.tsx`, `NovoClienteDialog`, fluxo de propostas, `clientes.index.tsx`.
- Limite por pessoa e auditoria dentro da função de servidor (auditoria com as colunas reais `alvo_user_id`/`ator_user_id`/`campo`/`valor_novo`).

## Testes

- Unitários: montagem da mensagem nos quatro casos (mesma equipe, outra equipe, sem dono, inexistente) e corte pelo limite.
- Banco, tudo em transação com ROLLBACK: vendedor INPLASTIC × CNPJ de colega INPLASTIC (dono + empresa); vendedor Maxicaixa × CNPJ INPLASTIC (só dono + equipe, sem empresa nem ids); documento com dono inativo (mensagem de sem responsável); documento inexistente (livre).
- Confirmação de que a criação continua recusada em todos os casos de duplicidade.
- Ao final: saída real de `bunx tsgo --noEmit`, `bunx vitest run` e `bun run build`. Nada publicado.
