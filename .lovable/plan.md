
# Diagnóstico dos 3 avisos de segurança

## ITEM 3 — SECURITY DEFINER executáveis por anon/public

Consultei `pg_proc` cruzando com `has_function_privilege` para `anon`, `authenticated` e `public`. Funções SECURITY DEFINER no schema `public`:

| Função | anon exec | authenticated exec | public exec | O que faz |
|---|---|---|---|---|
| `has_role(uuid, app_role)` | não | sim | não | Checa se um user tem um role. Lê `user_roles`. |
| `handle_new_user()` | não | não | não | Trigger de `auth.users`. Não chamável pela API. |
| `atribuir_proximo_vendedor(uuid)` | não | não | não | Round-robin de leads. |
| `placar_vendedores(text)` | não | sim | não | KPIs consolidados do time. |
| `snapshot_metas_mes(int,int)` | não | não | não | Snapshot mensal de metas. |
| **`next_proposta_number(int)`** | **SIM** | sim | **SIM** | Gera o próximo número sequencial de proposta do ano (`YYYY-NNNN`). Faz advisory lock e lê `propostas.number`. |

**Única função exposta ao anon/public: `next_proposta_number`.**

- **Chamadores reais no código:** apenas `src/lib/crm-store.ts:1024` via `supabase.rpc("next_proposta_number", …)`, sempre em contexto autenticado (criar proposta). Nenhum caller anônimo.
- **Risco real de anon poder executar:**
  - Não expõe dados sensíveis (retorna só o próximo número, ex.: `2026-0042`).
  - Mas permite: (a) enumerar quantas propostas existem no ano (vazamento de métrica de negócio); (b) DoS leve — cada chamada pega um `pg_advisory_xact_lock` no ano corrente e faz `MAX()` sobre `propostas`; um anon em loop consegue serializar/latenciar toda a criação de propostas legítimas.
  - **Sem risco de escrita** (função é `SELECT`-only apesar de SECURITY DEFINER, então não insere pulando RLS).

**Correção proposta:**
```sql
REVOKE EXECUTE ON FUNCTION public.next_proposta_number(integer) FROM anon, PUBLIC;
-- authenticated mantém EXECUTE (é o único caller real)
```
Manter `SECURITY DEFINER` (é necessário para o advisory lock funcionar de forma consistente entre roles) — só fechar o acesso anônimo. Não precisa mover de schema.

Observação: as outras SECURITY DEFINER já estão fechadas corretamente. `has_role` e `placar_vendedores` continuam disponíveis para `authenticated` — é o esperado, ambas são usadas pelas RLS/telas logadas.

---

## ITEM 1 — `clientes` sem policy de DELETE

Policies em `public.clientes` (via `pg_policies`):
- `INSERT` (authenticated): `vendedor_id = auth.uid() OR has_role(admin)` e `criado_por = auth.uid() OR null`
- `SELECT` (authenticated): `vendedor_id = auth.uid() OR has_role(admin)`
- `UPDATE` (authenticated): mesma condição
- **`DELETE`: nenhuma policy**

Com RLS habilitado e nenhuma policy de DELETE, o Postgres **fail-closed**: nem admin nem vendedor conseguem deletar via Data API. Confirmado no código: `src/lib/clientes.functions.ts` só expõe `listClientes`, `getCliente`, `createCliente`, `updateCliente`, `listLeadsByCliente`, `vincularClienteAoLead` — **não existe função server nem UI de deletar cliente** (a "desativação" é feita via `ativo=false` no `updateCliente`). `rg` por `delete`/`remove` em `src/routes/clientes*` e `src/components/clientes/` não retorna nada.

**Diagnóstico:** é intencional (soft-delete via `ativo`). O aviso é um lembrete, não uma vulnerabilidade.

**Correção proposta:** dois caminhos, o usuário escolhe:
- **(A) Documentar como intencional** — marcar o finding como ignorado com justificativa "clientes usa soft-delete via `ativo`; DELETE bloqueado por design". Nada muda no banco.
- **(B) Tornar explícito no schema** — adicionar uma policy restritiva que deixe claro:
  ```sql
  CREATE POLICY "clientes_no_delete" ON public.clientes
    FOR DELETE TO authenticated USING (false);
  ```
  Efeito idêntico ao atual, mas remove ambiguidade em auditorias/mudanças futuras.

Recomendação: **(B)**, é 2 linhas e evita alguém abrir uma policy de DELETE ampla por engano no futuro.

---

## ITEM 2 — `zapi_inbox` sem policy de INSERT

Policies em `public.zapi_inbox`:
- `SELECT` (authenticated): `has_role(admin)`
- `UPDATE` (authenticated): `has_role(admin)`
- **`INSERT`: nenhuma policy** → fail-closed para `authenticated` e `anon`

Grants na tabela mostram INSERT concedido a `anon` e `authenticated`, mas **RLS bloqueia** — sem policy de INSERT, ninguém logado nem anônimo consegue inserir via Data API.

Único caminho de escrita real: `src/routes/api/public/zapi/webhook.ts:67`, que faz `supabaseAdmin.from("zapi_inbox").insert(...)`. `supabaseAdmin` é o cliente com `SERVICE_ROLE_KEY` (importado dinamicamente de `@/integrations/supabase/client.server`), que **bypassa RLS**. O webhook está sob `/api/public/*` mas valida assinatura Z-API antes de escrever (rota `src/routes/api/public/zapi/webhook.ts`).

`rg` confirma: **nenhum outro insert em `zapi_inbox`** no código client-side/server-fn. E o teste `scripts/test-zapi-inbox-rls.ts` já valida que anon/vendedor não leem nada — o modelo é service-role-only, como o aviso sugere.

**Diagnóstico:** intencional e correto — escrita só via service role no webhook verificado.

**Correção proposta:** também dois caminhos:
- **(A) Ignorar o finding** com justificativa "insert é service-role-only via webhook Z-API verificado; RLS default-deny já bloqueia clientes".
- **(B) Tornar explícito** com policy restritiva:
  ```sql
  CREATE POLICY "zapi_inbox_no_client_insert" ON public.zapi_inbox
    FOR INSERT TO authenticated, anon WITH CHECK (false);
  ```
  Comportamento igual (RLS já nega), mas documenta a intenção no schema.

Recomendação: **(B)** pelo mesmo motivo do item 1.

---

# Plano de correção (a executar depois da sua aprovação)

Uma única migration com:

1. **Item 3 (real):**
   ```sql
   REVOKE EXECUTE ON FUNCTION public.next_proposta_number(integer) FROM anon, PUBLIC;
   ```
2. **Item 1 (documental):**
   ```sql
   CREATE POLICY "clientes_no_delete" ON public.clientes
     FOR DELETE TO authenticated USING (false);
   ```
3. **Item 2 (documental):**
   ```sql
   CREATE POLICY "zapi_inbox_no_client_insert" ON public.zapi_inbox
     FOR INSERT TO authenticated, anon WITH CHECK (false);
   ```
4. Depois: `manage_security_finding` marcando os 3 como fixed com a explicação correspondente, e atualização da `security-memory` para não reincidir.

Nenhum código de app precisa mudar. `next_proposta_number` continua funcionando para o único caller real (usuário autenticado criando proposta).

Me confirma se topa esse plano — ou se prefere só ignorar os itens 1 e 2 sem criar as policies explícitas.
