## Diagnóstico

### 1) Onde o insert/update acontece e por que o texto cru vaza

**Único ponto de INSERT:** `createCliente` em `src/lib/clientes.functions.ts` (linhas 182–241). Consumido apenas pelo `NovoClienteDialog`, que é usado em duas telas: `/clientes` (botão "Novo cliente") e `/propostas` (botão "Cadastrar novo cliente" no seletor). Não existe outro caminho — nenhum fluxo lead→cliente ou seleção em proposta cria cliente por conta própria.

**UPDATE:** `updateCliente` (linhas 246–313). O CNPJ é tratado como imutável no `merged` (linha 260 força `current.cnpj`), então o update **não** dispara `clientes_cnpj_key` na prática.

**Por que o texto cru vaza:** `createCliente` faz uma checagem preliminar (linhas 190–206) via `context.supabase` (RLS-aware). Se o CNPJ já existe **mas pertence a outro vendedor** e o usuário logado **não é admin**, a policy `clientes_select_dono_ou_admin` (`vendedor_id = auth.uid() OR is admin`) esconde a linha → o pré-check retorna vazio → o insert prossegue → o Postgres rejeita com `duplicate key value violates unique constraint "clientes_cnpj_key"`. O handler então faz `throw new Error(error.message)` (linha 239), o `NovoClienteDialog` captura em `handleSave` e joga `e.message` direto no `toast.error` (linha 111). Nenhum tratamento traduz esse texto.

Cenário secundário: mesmo quando o pré-check funciona, a mensagem retornada (`CNPJ já cadastrado para "..." (id:UUID; outro vendedor)`) vaza o **UUID do registro**, que é ruído para o usuário final.

### 2) A constraint cobre inativos?

**Sim, cobre.** `clientes_cnpj_key` é `UNIQUE (cnpj)` puro (sem `WHERE ativo = true`, sem partial index). Confirmado em `pg_constraint`. Portanto um cliente com `ativo = false` **continua ocupando o CNPJ** e bloqueia qualquer novo cadastro com o mesmo número. Além disso, a policy de SELECT não filtra por `ativo`, mas filtra por `vendedor_id`/admin — ou seja, um inativo de outro vendedor é invisível ao pré-check mas ainda ocupa o CNPJ no banco.

### 3) Plano de correção (proposto, sem implementar)

**(a) Traduzir erros de duplicidade em todos os pontos de insert/update**

1. Em `createCliente` (e por simetria em `updateCliente`), envolver o `insert`/`update` num try/catch e mapear o erro Postgres para uma mensagem PT-BR curta:
   - `error.code === '23505'` **e** `error.message` cita `clientes_cnpj_key` → lançar `Error("Já existe um cliente com este CNPJ.")`.
   - Outros códigos `23505` (raro) → mensagem genérica curta.
   - Demais erros → mensagem genérica ("Não foi possível salvar o cliente. Tente novamente.") sem repassar `error.message` cru.
2. Reformular a mensagem do pré-check para não vazar UUID e alinhar com a mensagem do fallback: `"Já existe um cliente com este CNPJ."` (sem `id:...`, sem "outro vendedor"). O objetivo é: usuário nunca vê JSON/constraint/UUID.
3. Criar um helper `friendlyClienteError(e)` em `src/lib/clientes.ts` (novo, client-safe, análogo a `friendlyCnpjError`) e usá-lo nos toasts de `NovoClienteDialog.handleSave` e `clientes.$id.handleSave` — segunda linha de defesa caso um erro cru escape do servidor.

**(b) Detectar cliente inativo com o mesmo CNPJ e orientar o usuário**

Para dar a mensagem específica "existe inativo, reative", o servidor precisa enxergar o registro mesmo quando o usuário atual não é o dono. Duas opções, ordem de preferência:

- **Opção 1 (recomendada):** criar uma função SQL `SECURITY DEFINER` `public.cnpj_status(_cnpj text)` que retorna `{ existe: bool, ativo: bool, mesmo_vendedor: bool }` (sem expor `id`/razão social/vendedor). `createCliente` chama essa função ANTES do insert e escolhe a mensagem:
  - existe & ativo & mesmo_vendedor → `"Você já tem um cliente ativo com este CNPJ."`
  - existe & ativo & outro vendedor → `"Já existe um cliente com este CNPJ."` (sem revelar quem)
  - existe & inativo & mesmo_vendedor → `"Você tem um cliente inativo com este CNPJ. Reative em Clientes."` + payload `{ podeReativar: true, id }` para a UI oferecer botão "Reativar".
  - existe & inativo & outro vendedor → `"Já existe um cliente inativo com este CNPJ. Peça a um admin para reativar."`
  - Fallback (`23505` no insert, corrida) → mensagem genérica de duplicidade.
- **Opção 2 (mais simples, menos informativa):** manter só o mapeamento `23505 → "Já existe um cliente com este CNPJ."` e não diferenciar inativo. Perde-se o fluxo de reativação, mas elimina o texto cru com risco mínimo.

**Fluxo opcional de reativação** (se ficarmos com a Opção 1):
- Quando `podeReativar: true` (dono do inativo), o `NovoClienteDialog` mostra um toast/alert com botão **"Reativar cliente"** que chama `updateCliente({ id, patch: { ativo: true, ...camposDoFormulário } })` — reaproveita o path de update existente, sem precisar de RPC nova.
- Para admin, o mesmo botão aparece independente do dono.
- Vendedor comum vendo inativo de outro vendedor: só mensagem, sem botão.

**Não escopo desta correção** (evitar mudança maior sem pedido explícito): trocar a UNIQUE por partial index `WHERE ativo = true` — permitiria múltiplos inativos com mesmo CNPJ e mudaria semântica do dado histórico; não recomendo agora.

### Arquivos que seriam tocados quando implementarmos

- `src/lib/clientes.functions.ts` — try/catch com mapeamento `23505`, mensagem do pré-check limpa, chamada de `cnpj_status` (Opção 1).
- `src/lib/clientes.ts` (novo) — helper `friendlyClienteError`.
- `src/components/clientes/NovoClienteDialog.tsx` — usar helper no toast, tratar payload `podeReativar` (Opção 1).
- `src/routes/clientes.$id.tsx` — usar helper no toast do save.
- Migration nova para `public.cnpj_status(text)` (só na Opção 1).

Aguardo sua escolha entre **Opção 1** (com fluxo de reativação e mensagens específicas para inativo) e **Opção 2** (só mensagem genérica amigável) antes de implementar.
