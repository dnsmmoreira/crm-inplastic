# Diagnóstico: Cliente x Contato (somente investigação)

## Resumo

Não existe um campo "tipo = cliente/contato". São **duas tabelas totalmente separadas**, com telas, cadastros e regras diferentes:

- **Contatos** (`/contatos`) = a tabela `leads`. É a mesma base do Pipeline/Kanban, só exibida em lista.
- **Clientes** (`/clientes`) = a tabela `clientes`. Cadastro fiscal (CNPJ/CPF, IE, endereço, empresa padrão).

A ligação entre as duas é opcional e feita por um único campo: `leads.cliente_id`. Hoje, dos 92 leads existentes, apenas **8 têm cliente vinculado**; há **37 clientes** cadastrados (36 ativos).

## 1) Qual regra define "cliente" ou "contato"?

Nenhuma regra automática. O registro só vira cliente se **alguém criar explicitamente** um cadastro na tabela `clientes`:

- `src/components/clientes/NovoClienteDialog.tsx` → chama `createCliente` (`src/lib/clientes.functions.ts:221`), acionado pelo botão "Novo cliente" em `/clientes` ou dentro do fluxo "Nova proposta".
- `src/routes/propostas.index.tsx:466` usa `vincularClienteAoLead` (`src/lib/clientes.functions.ts:483`) para gravar `leads.cliente_id`.

Ou seja: **criar lead nunca cria cliente**. `addLead` (`src/lib/crm-store.ts:831`) grava só em `leads`. Não há gatilho no banco nem código que promova um lead a cliente ao ganhar, ao virar pedido ou ao receber proposta.

## 2) Diferença entre formulário/webhook, manual e I.A.

Todos os três caminhos criam **apenas leads (contatos)** — nenhum cria cliente:

- **Automático / webhook WhatsApp**: `src/lib/whatsapp-inbound.server.ts` cria a conversa e tenta apenas *achar* um lead pelo telefone (linhas 85-96). Não cria lead nem cliente.
- **I.A. (n8n)**: `src/routes/api/public/hooks/ia-qualificar.ts:99-120` insere em `leads` com `stage: "novo"`, `origem: "whatsapp"`, `source: "WhatsApp IA"`, `owner_id: null` — depois um vendedor é atribuído por round-robin. Nunca toca em `clientes`, nunca preenche `cliente_id`.
- **Manual pelo vendedor**: `NewLeadDialog` → `addLead` em `src/lib/crm-store.ts:831`, com validação de CNPJ duplicado apenas **entre leads**. Também sem criar cliente.
- **Cadastro manual de cliente**: só pela tela `/clientes` (ou pelo dialog dentro de Nova Proposta), com validação forte de CNPJ/CPF, empresa padrão e checagem de duplicidade via RPC `cnpj_status`.

Consequência prática: leads vindos de formulário e da I.A. **sempre** nascem como "contato" e nunca aparecerão em Clientes até alguém cadastrá-los lá.

## 3) Por que a aba Clientes "não mostra" registros

Três causas independentes, todas confirmadas no código/banco:

1. **O registro simplesmente não existe em `clientes`.** Ele é um lead. A tela `/clientes` lê só a tabela `clientes` (`listClientes`, `src/lib/clientes.functions.ts:121`), nunca leads.
2. **Filtro padrão "somente ativos".** `src/routes/clientes.index.tsx` inicia com `somenteAtivos = true` e `listClientes` aplica `.eq("ativo", true)` (linha 145). Como a exclusão é soft-delete (política `clientes_no_delete` bloqueia DELETE), clientes desativados somem da lista.
3. **RLS por dono.** Política `clientes_select_dono_ou_admin`: `vendedor_id = auth.uid() OR has_role(admin)`. Um vendedor não vê clientes de outro vendedor. O equivalente em leads é `owner_id`, então o mesmo negócio pode estar visível em Contatos (lead do vendedor) e invisível em Clientes (cadastro de outro vendedor) — e vice-versa.

Detalhe adicional: a busca em `listClientes` (linhas 149-158) só procura por CNPJ quando o termo tem 3+ dígitos; caso contrário busca só em `razao_social`/`nome_fantasia` — não busca por CPF nem por e-mail/telefone, o que também dá a impressão de "não aparece".

## Arquivos relevantes

- `src/lib/clientes.functions.ts` — CRUD de clientes, `listClientes`, `vincularClienteAoLead`
- `src/routes/clientes.index.tsx` — tela Clientes (filtros, paginação)
- `src/routes/contatos.tsx` — tela Contatos (lista de `leads`)
- `src/lib/crm-store.ts:831` — `addLead` (cadastro manual)
- `src/routes/api/public/hooks/ia-qualificar.ts` — criação de lead pela I.A.
- `src/lib/whatsapp-inbound.server.ts` — entrada de WhatsApp
- Políticas RLS de `clientes` e `leads` no banco

## Próximo passo (nada implementado)

Se quiser, o passo seguinte seria decidir uma regra de promoção lead → cliente (por exemplo: ao ganhar, ou ao gerar pedido, criar/vincular cliente automaticamente) e/ou mostrar em Contatos um selo "já é cliente". Nada disso existe hoje.
