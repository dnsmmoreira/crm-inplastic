# LEADS_API — Integração externa (n8n) com o CRM INPLASTIC

Contrato para o **n8n** (ou qualquer sistema externo) inserir leads,
interações, ações do agente e mensagens de WhatsApp diretamente no banco do
CRM. **Não existe endpoint HTTP intermediário** — o n8n usa o node
**Supabase** autenticado com a **`service_role`** e escreve nas tabelas
listadas abaixo.

---

## 1. Autenticação

- **URL do projeto:** `https://klbkkertbwuusegtdgkw.supabase.co`
- **Key:** `SUPABASE_SERVICE_ROLE_KEY` — armazenada como secret no CRM;
  peça ao admin. Nunca colocar em código público ou variável `VITE_*`.
- No node **Supabase** do n8n, escolha **Service Role** e cole a chave.
- `service_role` **ignora RLS** — pode inserir com `owner_id = NULL` em
  `leads`, `lead_interactions` e `lead_ai_actions` (validado no banco).
- Todo request via Data API precisa dos headers:

```
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
Prefer: return=representation
```

---

## 2. Enums canônicos

Use **exatamente** um destes valores:

| Enum                 | Valores                                                                             |
|----------------------|-------------------------------------------------------------------------------------|
| `lead_stage`         | `atendimento` \| `novo` \| `qualificacao` \| `proposta` \| `negociacao` \| `ganho` \| `perdido` |
| `interaction_type`   | `email` \| `call` \| `meeting` \| `note` \| `whatsapp`                              |
| `ai_action_type`     | `followup` \| `schedule` \| `qualify` \| `reply` \| `alerta` \| `resumo`             |
| `conversa_status`    | `ia_atendendo` \| `humano_atendendo` \| `qualificado` \| `encerrado`                |
| `msg_direcao`        | `entrada` \| `saida`                                                                |
| `msg_autor`          | `cliente` \| `ia` \| `vendedor`                                                     |

Padrão para leads novos vindos do n8n: `stage = 'novo'`.

---

## 3. Inserir Lead — `public.leads`

Obrigatório: `company`. Recomenda-se sempre preencher `telefone_whatsapp`
(digitado como só dígitos com DDI **55**) para vincular a conversa Z-API.

```
POST /rest/v1/leads
Body:
{
  "company": "Frigorífico Litoral LTDA",
  "contact_name": "Marcos Andrade",
  "email": "marcos@frigolitoral.com.br",
  "phone": "(48) 99123-8877",
  "telefone_whatsapp": "5548991238877",
  "product": "Pallet Higiênico",
  "quantity": 300,
  "estimated_value": 73500,
  "stage": "novo",
  "tags": ["Exportação"],
  "segment": "Ind Alimentos",
  "source": "Formulário Site",
  "origem": "site:palletdeplastico",
  "external_id": "form-2025-0917",
  "cnpj": "12.345.678/0001-90",
  "notes": "Volume ~150 un/mês, urgência 30 dias.",
  "owner_id": null
}
```

- `owner_id: null` → lead entra na fila de distribuição (só o admin
  enxerga até ser atribuído).
- `owner_id: "<uuid do vendedor>"` → lead já entra vinculado.
- **Duplicidade de CNPJ:** índice único parcial em `cnpj`. Insert com CNPJ
  já existente devolve erro `23505` — trate com upsert (`on_conflict=cnpj`)
  ou log.
- Batch: aceita array JSON. Prefira lotes ≤ 100.

### Upsert por CNPJ

```
POST /rest/v1/leads?on_conflict=cnpj
Prefer: resolution=merge-duplicates,return=representation
```

---

## 4. Registrar Interação — `public.lead_interactions`

Toda interação inserida atualiza `leads.last_interaction_at` via trigger.

```
POST /rest/v1/lead_interactions
Body:
{
  "lead_id": "<uuid do lead>",
  "type": "whatsapp",
  "content": "Cliente pediu cotação para 500 un.",
  "occurred_at": "2026-07-06T14:32:00-03:00",
  "owner_id": null
}
```

- `owner_id` é opcional (herda do lead quando exibido na UI).
- `metadata` (jsonb) livre para anexos, IDs externos etc.

---

## 5. Diário do Xerife — `public.lead_ai_actions`

Registre ações automáticas do n8n / IA (não é usado para enviar mensagem —
apenas registro para o painel do Xerife).

```
POST /rest/v1/lead_ai_actions
Body:
{
  "lead_id": "<uuid ou null>",
  "type": "qualify",
  "content": "IA classificou como qualificado (score 0.87).",
  "metadata": { "canal": "whatsapp", "modelo": "n8n-worker-1" }
}
```

`type = 'resumo'` fica reservado para o **motor Xerife** — n8n não deve
usar.

---

## 6. Atendimento WhatsApp

### 6.1 Conversas — `public.whatsapp_conversas`

Uma linha por telefone.

| Coluna                 | Tipo                    | Notas                                                          |
|------------------------|-------------------------|----------------------------------------------------------------|
| `id`                   | uuid (gerado)           | PK                                                             |
| `phone`                | text (único)            | **só dígitos com DDI 55** (`5548991238877`)                    |
| `name`                 | text (nullable)         | nome exibido no WhatsApp                                       |
| `lead_id`              | uuid (nullable)         | vínculo com `leads.id`                                         |
| `status`               | `conversa_status`       | default `ia_atendendo`                                         |
| `ia_ativa`             | boolean                 | default `true` — **regra de ouro do n8n**                      |
| `last_message_preview` | text                    | atualizado por trigger ao inserir mensagem                     |
| `last_message_at`      | timestamptz             | idem                                                           |

Normalmente o n8n **não precisa inserir** nesta tabela — o webhook
`/api/public/zapi/webhook` do CRM já cria/atualiza a conversa ao receber
mensagem do cliente. O n8n só faz `UPDATE` para mudar `status` ou
`ia_ativa`.

### 6.2 Mensagens — `public.whatsapp_mensagens`

```
POST /rest/v1/whatsapp_mensagens
Body:
{
  "conversa_id": "<uuid da conversa>",
  "direcao": "saida",
  "autor": "ia",
  "conteudo": "Olá! Sou o assistente da INPLASTIC. Em que posso ajudar?",
  "external_id": null
}
```

Ao inserir uma mensagem, o trigger `tg_touch_conversa` atualiza
`whatsapp_conversas.last_message_at` / `last_message_preview` e, para
mensagens de cliente, também `leads.last_interaction_at`.

### 6.3 Regra de ouro para o n8n

Antes de responder qualquer mensagem, leia a conversa do telefone:

```sql
SELECT ia_ativa, status FROM whatsapp_conversas WHERE phone = $1;
```

- Só responda se `ia_ativa = true`.
- Se `status IN ('humano_atendendo', 'qualificado', 'encerrado')` →
  **não responda**; o vendedor assumiu.

### 6.4 Encerrar / desativar IA

```sql
UPDATE whatsapp_conversas
   SET ia_ativa = false, status = 'encerrado', updated_at = now()
 WHERE id = '<uuid>';
```

---

## 7. Handoff e distribuição — `atribuir_proximo_vendedor`

Função de banco `SECURITY DEFINER` que faz **round-robin** entre os
vendedores da fila (`public.fila_vendedores.ativo = true`, ordenados por
`posicao`). Ao ser chamada com o `lead_id`, ela executa **em uma única
transação**:

1. Escolhe o próximo vendedor após o último atribuído (`fila_estado`).
2. Se chegou ao fim da fila, volta ao primeiro ativo (ciclo).
3. Atualiza `leads.owner_id = <vendedor>` e `leads.stage = 'qualificacao'`.
4. Atualiza a `whatsapp_conversas` vinculada ao lead:
   `status = 'qualificado'`, `ia_ativa = false`.
5. Retorna o `uuid` do vendedor escolhido.

Se não houver vendedor ativo na fila, dispara `RAISE EXCEPTION 'Nenhum
vendedor ativo na fila'`.

### Chamada via Data API (RPC)

```
POST /rest/v1/rpc/atribuir_proximo_vendedor
Body:
{ "_lead_id": "<uuid do lead>" }
```

Ou via SQL/node "Supabase → Execute Query":

```sql
SELECT public.atribuir_proximo_vendedor('<uuid do lead>'::uuid);
```

**Pré-condições:**
- O `lead_id` deve existir.
- O lead precisa ter `telefone_whatsapp` batendo com
  `whatsapp_conversas.phone` **antes** da chamada (para o passo 4
  encontrar a conversa) — se não achar, o lead é atribuído normalmente
  mas a conversa fica como está.

---

## 8. Fluxo canônico (WhatsApp → Qualificação)

1. **Webhook Z-API** insere mensagem em `whatsapp_conversas` +
   `whatsapp_mensagens` (feito pelo CRM em `/api/public/zapi/webhook`).
2. **n8n dispara** ao receber mensagem nova (via Supabase Realtime ou
   polling em `whatsapp_mensagens WHERE autor = 'cliente'`).
3. **n8n lê** `ia_ativa` da conversa. Se `false` → ignora.
4. **n8n chama o LLM** para gerar resposta.
5. **n8n grava** a resposta em `whatsapp_mensagens` (`autor='ia'`,
   `direcao='saida'`).
6. **n8n envia** via API do Z-API (`send-text`).
7. Quando a IA classificar como qualificado:
   1. `INSERT` em `leads` com dados coletados + `telefone_whatsapp` =
      número da conversa + `owner_id = null`.
   2. `SELECT atribuir_proximo_vendedor('<lead_id>')` — atribui
      vendedor + move para `qualificacao` + libera a conversa.
   3. Opcional: `INSERT` em `lead_ai_actions` (`type='qualify'`) com o
      resumo da qualificação.

Após isso, o vendedor vê o lead no pipeline dele e a conversa aparece
"Qualificado" no painel `/canais`.

---

## 9. Segurança / Regras que o n8n NÃO deve violar

- **Nunca** escrever em `xerife_config`, `user_roles`, `profiles` ou
  qualquer tabela `auth.*`.
- **Nunca** enviar mensagem para o cliente diretamente pelo Xerife/CRM —
  o Xerife notifica apenas a equipe interna (WhatsApp do vendedor/admin
  com telefone cadastrado em `profiles.telefone_whatsapp`). O n8n é o
  único autorizado a responder o cliente, e sempre respeitando a regra
  de ouro (item 6.3).
- **Nunca** logar a `SERVICE_ROLE_KEY` nem trafegá-la pelo browser.
- Ao inserir `lead_ai_actions` com `type='resumo'`, evite — esse tipo
  é reservado ao motor Xerife interno.

---

## 10. FAQ

**P: Posso inserir múltiplos leads em batch?**
R: Sim. O endpoint aceita array JSON. Prefira lotes ≤ 100.

**P: Como envio mídia (imagem/áudio)?**
R: Nesta fase apenas texto está mapeado. Se precisar, abra pedido — o
schema de `whatsapp_mensagens` precisa de colunas extras.

**P: A IA pode enviar mensagem "espontânea" (sem estar respondendo)?**
R: Sim — grave em `whatsapp_mensagens` (`autor='ia'`, `direcao='saida'`)
**e** dispare o envio pela API do Z-API pelo próprio n8n.

**P: Onde está o log bruto do Z-API?**
R: `public.zapi_inbox` (uma linha por evento). É usado só para auditoria;
o dado "de trabalho" é `whatsapp_conversas` + `whatsapp_mensagens`.

**P: Como saber se meu insert respeitou o RLS?**
R: `service_role` bypassa RLS. Se o insert falhar, é integridade
(`23505` = duplicado, `23503` = FK ausente, `23514` = check violado, etc.)
ou GRANT — nunca RLS. O CRM validou que INSERT com `owner_id = NULL` é
aceito em `leads`, `lead_interactions` e `lead_ai_actions`.
