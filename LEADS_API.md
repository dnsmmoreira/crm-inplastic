# LEADS_API — Integração externa (n8n) com o CRM INPLASTIC

Este documento é o contrato para o **n8n** (ou qualquer sistema externo) inserir
leads, interações e mensagens de WhatsApp diretamente no banco do CRM.

**Não existe endpoint HTTP intermediário** — o n8n usa o node **Supabase**
autenticado com a **`service_role`** e escreve nas tabelas listadas abaixo.

---

## Autenticação

- **URL do projeto:** `https://klbkkertbwuusegtdgkw.supabase.co`
- **Key:** `SUPABASE_SERVICE_ROLE_KEY` (guardada como secret no CRM; peça ao admin).
- No node **Supabase** do n8n, escolha o método **Service Role** e cole a chave.
- `service_role` **ignora RLS** — pode inserir com `owner_id = NULL` em `leads`
  (o admin distribui depois) ou já atribuir via `atribuir_proximo_vendedor`.

---

## Estágios canônicos (enum `lead_stage`)

Use **exatamente** um destes valores em `leads.stage`:

```
atendimento | novo | qualificacao | proposta | negociacao | ganho | perdido
```

Padrão para leads novos vindos do n8n: `novo`.

---

## 1. Inserir Lead

**Tabela:** `public.leads`

Colunas obrigatórias: `company`. Todo o resto é opcional (mas quanto mais
preencher, melhor).

```json
POST /rest/v1/leads
Headers:
  apikey: <SERVICE_ROLE_KEY>
  Authorization: Bearer <SERVICE_ROLE_KEY>
  Content-Type: application/json
  Prefer: return=representation
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

- `owner_id: null` → lead entra na fila de distribuição (só admin enxerga
  até ser atribuído).
- `owner_id: "<uuid do vendedor>"` → lead já entra vinculado a um vendedor
  específico.
- `telefone_whatsapp`: **só dígitos com DDI 55** (`5548991238877`). É esse
  campo que casa com a conversa de WhatsApp.

**Duplicidade de CNPJ:** o banco tem índice único parcial em `cnpj`. Insert
com CNPJ já existente retorna erro `23505` — trate no n8n com upsert por
`cnpj` ou log.

---

## 2. Registrar Interação (histórico do lead)

**Tabela:** `public.lead_interactions`

Toda interação inserida atualiza `leads.last_interaction_at`
automaticamente (via trigger de banco).

```json
POST /rest/v1/lead_interactions
Body:
{
  "lead_id": "<uuid do lead>",
  "type": "whatsapp",        // email | call | meeting | note | whatsapp
  "content": "Cliente pediu cotação para 500 un.",
  "occurred_at": "2025-09-17T14:32:00-03:00"
}
```

---

## 3. Diário do Xerife (opcional)

**Tabela:** `public.lead_ai_actions`

Use para deixar registro de ações automáticas do n8n (ex.: "enviei mensagem
de boas-vindas", "qualifiquei"):

```json
POST /rest/v1/lead_ai_actions
Body:
{
  "lead_id": "<uuid do lead ou null>",
  "type": "followup",        // followup | schedule | qualify | reply | alerta | resumo
  "content": "IA respondeu apresentando o catálogo.",
  "metadata": { "canal": "whatsapp", "modelo": "n8n-worker-1" }
}
```

---

## 4. Atendimento WhatsApp (IA + handoff)

### 4.1 Conversas

**Tabela:** `public.whatsapp_conversas` — **uma linha por telefone**.

| Coluna       | Tipo                              | Notas                                                            |
|--------------|-----------------------------------|------------------------------------------------------------------|
| `id`         | uuid                              | gerado                                                           |
| `phone`      | text, único                       | só dígitos com DDI 55                                            |
| `name`       | text                              | nome exibido no WhatsApp                                         |
| `lead_id`    | uuid, nullable                    | vínculo com `leads.id` (opcional)                                |
| `status`     | enum `conversa_status`            | `ia_atendendo` \| `humano_atendendo` \| `qualificado` \| `encerrado` |
| `ia_ativa`   | boolean                           | **regra de ouro: n8n só responde se `ia_ativa = true`**          |

O webhook do Z-API (`/api/public/zapi/webhook`) já cria/atualiza a conversa
sozinho quando chega mensagem do cliente. O n8n normalmente **não precisa
inserir aqui** — só faz UPDATE para mudar status/`ia_ativa`.

### 4.2 Mensagens

**Tabela:** `public.whatsapp_mensagens`

Insira **toda resposta da IA** com `autor = 'ia'`:

```json
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

O trigger de banco atualiza `whatsapp_conversas.last_message_at`,
`last_message_preview` e `leads.last_interaction_at` automaticamente.

### 4.3 Regra de ouro para o n8n

Antes de responder qualquer mensagem, **leia** `whatsapp_conversas` do
telefone e verifique:

```sql
SELECT ia_ativa, status FROM whatsapp_conversas WHERE phone = $1;
```

- Só responda se `ia_ativa = true`.
- Se `status = 'humano_atendendo'` → **não responda**, um vendedor assumiu.
- Se `status = 'qualificado'` → **não responda**, o vendedor está com o
  lead.

### 4.4 Handoff: qualificar e distribuir

Quando a IA conclui que a conversa está **qualificada** (é um lead válido),
chame a função `atribuir_proximo_vendedor` — ela faz round-robin entre os
vendedores da fila e já:

1. Cria/atribui o `owner_id` do lead.
2. Muda `leads.stage` para `qualificacao`.
3. Muda `whatsapp_conversas.status` para `qualificado` e `ia_ativa` para
   `false`.

```sql
-- No n8n, use o node "Supabase → RPC":
SELECT public.atribuir_proximo_vendedor('<uuid do lead>'::uuid);
```

Se ainda **não há lead**, primeiro insira um lead com os dados que a IA
coletou, depois chame a função com o `id` recém-criado. Um bom padrão é
usar `whatsapp_conversas.phone` como `leads.telefone_whatsapp` para
manter o vínculo.

### 4.5 Encerrar / desativar

```sql
UPDATE whatsapp_conversas SET ia_ativa=false, status='encerrado', updated_at=now()
 WHERE id = '<uuid>';
```

---

## 5. Exemplo completo — fluxo de qualificação pelo n8n

1. **Webhook Z-API** insere mensagem em `whatsapp_conversas` +
   `whatsapp_mensagens` (feito pelo CRM, não pelo n8n).
2. **n8n dispara** ao receber mensagem nova (via trigger Supabase Realtime
   ou polling em `whatsapp_mensagens where autor = 'cliente'`).
3. **n8n lê** `ia_ativa` do telefone. Se `false` → ignora.
4. **n8n chama LLM** para gerar resposta.
5. **n8n grava** a resposta em `whatsapp_mensagens` com `autor='ia'`.
6. **n8n envia** via API do Z-API (`send-text`).
7. Quando a IA classificar como qualificado:
   1. `INSERT` em `leads` com dados coletados + `telefone_whatsapp` =
      número da conversa.
   2. `SELECT atribuir_proximo_vendedor('<lead_id>')` — retorna o
      `uuid` do vendedor escolhido.
   3. Opcional: `INSERT` em `lead_ai_actions` (`type='qualify'`) com o
      resumo da qualificação.

Pronto — o vendedor vê o lead no pipeline dele e a conversa aparece
"Qualificado" no painel de Atendimento IA (para o admin).

---

## FAQ

**P: Posso inserir múltiplos leads em batch?**
R: Sim — o endpoint aceita array JSON. Prefira lotes ≤ 100 para não
estourar o payload.

**P: Como envio mídia (imagem/áudio)?**
R: Nesta fase apenas texto está mapeado. Se precisar, abra pedido — o
schema de `whatsapp_mensagens` precisa de colunas extras.

**P: A IA pode enviar mensagem "espontânea" (sem estar respondendo)?**
R: Sim — insira em `whatsapp_mensagens` (`autor='ia'`, `direcao='saida'`)
**e** dispare o envio pela API do Z-API pelo próprio n8n.

**P: Onde está o log bruto do que o Z-API mandou?**
R: Tabela `public.zapi_inbox` (uma linha por evento). É usado só para
auditoria — o dado "de trabalho" é `whatsapp_conversas` + `whatsapp_mensagens`.
