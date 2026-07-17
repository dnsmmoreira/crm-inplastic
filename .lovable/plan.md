## Diagnóstico

### (A) `fila_estado` — "Internal queue state readable by all authenticated users"

1. **Tabela e policy atual**
   - `public.fila_estado` (singleton, id=1). Colunas: `id`, `ultimo_user_id`, `updated_at`.
   - Policy SELECT: `"fila_estado read" FOR SELECT TO authenticated USING (true)`.
   - Grant: `SELECT` a `authenticated`, `ALL` a `service_role`. Sem policy de INSERT/UPDATE/DELETE (só service_role escreve).

2. **Sensibilidade**
   - Contém apenas um UUID (`ultimo_user_id` = último vendedor que recebeu lead no round-robin) + timestamp. Sem PII, sem dados de cliente. Estado operacional puro.
   - Risco real: baixo. Um vendedor autenticado consegue inferir quem foi o último a receber lead na fila — informação interna, não confidencial.

3. **Quem lê no app**
   - **Nenhum caller client-side nem server function** referencia `fila_estado`. Único acesso é dentro da função SQL `atribuir_proximo_vendedor(_lead_id)` (SECURITY DEFINER, `SET search_path = public`), que faz `SELECT ... FOR UPDATE` e `UPDATE`. Como é DEFINER, ignora RLS.

4. **Impacto de restringir SELECT a admins**
   - Zero quebra. Nenhuma tela/hook lê essa tabela via Data API. Placar/Dashboard não tocam nela.

5. **Correção proposta (mais segura, sem quebrar nada)**
   - `DROP POLICY "fila_estado read" ON public.fila_estado;` (não substituir — sem policy SELECT + RLS ligado = ninguém do lado cliente lê).
   - Opcional: `REVOKE SELECT ON public.fila_estado FROM authenticated;` (defense in depth; `atribuir_proximo_vendedor` roda como DEFINER e continua funcionando).
   - Manter `GRANT ALL ... TO service_role` para admin/manutenção.

---

### (B) `fila_vendedores` — "Sales queue assignment data readable by all authenticated users"

1. **Tabela e policy atual**
   - `public.fila_vendedores`. Colunas: `user_id`, `posicao`, `ativo`, timestamps.
   - Policies:
     - `"fila read authenticated" FOR SELECT TO authenticated USING (true)`
     - `"fila admin write" FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'))`
   - Grants: `SELECT` a `authenticated`, `ALL` a `service_role`.

2. **Sensibilidade**
   - `user_id` (FK auth.users), `posicao` na fila, flag `ativo`. Sem PII direta — mas cruzando com `profiles` revela ordem/atividade da equipe comercial. Sensibilidade baixa/média (operacional interno).

3. **Quem lê no app**
   - Só `src/lib/fila.functions.ts` (server functions com `requireSupabaseAuth`): `listFila`, `addFilaMember`, `removeFilaMember`, `toggleFilaAtivo`, `reorderFila`. Todas escritas passam por `assertAdmin`; `listFila` **não** exige admin explicitamente, mas só é chamada em `src/routes/usuarios.tsx`, que é gated a admin no componente.
   - Função SQL `atribuir_proximo_vendedor` também lê (via DEFINER, ignora RLS).
   - **Nenhum componente client-side** (Placar, Dashboard, ResumoDoDia, PlacarWidget) faz `.from("fila_vendedores")`. Placar usa `placar_vendedores` (função separada), não a fila.

4. **Impacto de restringir SELECT a admins**
   - `listFila` roda com o token do usuário autenticado → hoje qualquer authenticated consegue chamar e ler. Restringindo policy a admin:
     - Chamadas de não-admin a `listFila` passariam a retornar lista vazia (RLS filtra). Como `listFila` só aparece na página `/usuarios` (admin-only na UI), não há regressão prática.
     - Nada mais quebra: `atribuir_proximo_vendedor` continua funcionando (DEFINER).
   - Placar de Vendedores, Dashboard, ResumoDoDia: **não afetados** — não consultam essa tabela.

5. **Correção proposta**
   - Substituir a policy permissiva por uma restrita a admins:
     ```sql
     DROP POLICY "fila read authenticated" ON public.fila_vendedores;
     CREATE POLICY "fila read admin"
       ON public.fila_vendedores FOR SELECT TO authenticated
       USING (public.has_role(auth.uid(), 'admin'));
     ```
   - Reforçar `listFila` com `assertAdmin` no início da handler (defense in depth; hoje só a UI gateia).
   - Grants permanecem inalterados.

---

### Resumo executivo

Ambos os findings são de baixo impacto real, e ambos podem ser corrigidos sem quebrar nenhuma tela — o Placar não usa essas tabelas, e o round-robin roda por função SECURITY DEFINER que bypassa RLS. A única superfície client-side afetada (`listFila`) já é admin-only na UI, então restringir a policy apenas alinha o backend ao que a UI já pratica.

**Não aplicado nada** — aguardando aprovação para gerar a migration com:
1. Drop da policy SELECT permissiva de `fila_estado` (opcional: revoke SELECT de authenticated).
2. Drop da policy SELECT permissiva de `fila_vendedores` e criação de policy restrita a admin.
3. `assertAdmin` no `listFila`.
