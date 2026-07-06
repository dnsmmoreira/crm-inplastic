# LEADS_API — Integração n8n ↔ CRM INPLASTIC

O n8n é o **cérebro de IA** do atendimento WhatsApp. Como o backend do
CRM roda em Lovable Cloud e a `service_role` **não** é exposta para
sistemas externos, toda comunicação n8n ↔ CRM passa por **dois endpoints
HTTP públicos** protegidos por um segredo compartilhado (`N8N_SECRET`),
no mesmo padrão do Xerife.

Fluxo em uma linha:
`WhatsApp → Z-API webhook → CRM grava mensagem → CRM notifica n8n → n8n pensa → n8n chama endpoints do CRM (responder / qualificar)`.

---

## 1. Segredos

Configurados em **Backend → Secrets** do projeto Lovable Cloud:

| Secret            | Origem                                       | Uso                                                                 |
|-------------------|----------------------------------------------|---------------------------------------------------------------------|
| `N8N_SECRET`      | gerado pelo CRM (64 hex, aleatório)          | Header `x-n8n-secret` em **ambos os sentidos** (CRM→n8n e n8n→CRM)  |
| `N8N_WEBHOOK_URL` | você fornece (URL do webhook do fluxo n8n)   | CRM chama esta URL para notificar chegada de mensagem do cliente    |

- O `N8N_SECRET` **não** aparece em código. No n8n, copie o valor a partir
  de Backend → Secrets do CRM e use-o para (a) validar o header
  `x-n8n-secret` que o CRM envia no webhook de saída e (b) enviá-lo de
  volta ao chamar os endpoints do CRM.
- Requests sem o header ou com valor divergente retornam **401**.

---

## 2. Notificação de saída (CRM → n8n)

Quando o webhook do Z-API (`/api/public/zapi/webhook`) grava uma
**mensagem de cliente** e a conversa está com `ia_ativa = true` e
`status = 'ia_atendendo'`, o CRM dispara **fire-and-forget** um POST
para `N8N_WEBHOOK_URL`.

- Método: `POST`
- Headers:
  - `Content-Type: application/json`
  - `x-n8n-secret: <N8N_SECRET>`
- Body:

```json
{
  "conversa_id": "3f0d…",
  "phone": "5548991238877",
  "lead_id": "b12a…",
  "historico": [
    { "autor": "cliente",  "conteudo": "Olá, quero cotar pallets", "created_at": "2026-07-06T14:30:00Z" },
    { "autor": "ia",       "conteudo": "Oi! Sou o assistente…",    "created_at": "2026-07-06T14:30:02Z" }
  ]
}
```

Regras:
- `historico` = últimas **20 mensagens** da conversa, ordem cronológica.
- `lead_id` pode ser `null` (conversa ainda não virou lead).
- O CRM **não bloqueia** a resposta ao Z-API para esperar o n8n.
- O n8n só é notificado quando `ia_ativa = true` **e**
  `status = 'ia_atendendo'`. Ao mudar para `humano_atendendo`,
  `qualificado` ou `encerrado`, o CRM para de disparar (regra de ouro).

---

## 3. Endpoint — `POST /api/public/hooks/ia-responder`

Usado pelo n8n para **responder ao cliente**. O CRM envia a mensagem via
Z-API e registra em `whatsapp_mensagens` como `autor='ia'`,
`direcao='saida'`.

- Header: `x-n8n-secret: <N8N_SECRET>` (401 se ausente/divergente)
- Body:

```json
{
  "conversa_id": "3f0d…",
  "mensagem": "Perfeito! Você prefere pallet 1200×1000 ou 1000×1200?"
}
```

Respostas:

| Status | Situação                                                              |
|--------|-----------------------------------------------------------------------|
| 200    | `{ "ok": true }` — mensagem enviada e persistida                       |
| 400    | body inválido / `conversa_id` ou `mensagem` ausentes                   |
| 401    | `x-n8n-secret` inválido                                                |
| 404    | conversa não encontrada                                                |
| 409    | `ia_ativa = false` — humano assumiu; o n8n **não deve** insistir      |
| 502    | falha ao enviar via Z-API (mensagem propagada no body)                 |

> Se retornar 409, o n8n deve encerrar o fluxo daquela conversa: quem
> passa a responder é o vendedor pela UI `/atendimento-ia`.

---

## 4. Endpoint — `POST /api/public/hooks/ia-qualificar`

Usado pelo n8n quando a IA considera o cliente **qualificado**. Cria o
lead (se ainda não existir), marca a conversa como qualificada, desliga a
IA e, opcionalmente, distribui para o próximo vendedor da fila.

- Header: `x-n8n-secret: <N8N_SECRET>` (401 se ausente/divergente)
- Body:

```json
{
  "conversa_id": "3f0d…",
  "dados": {
    "empresa": "Frigorífico Litoral LTDA",
    "contato": "Marcos Andrade",
    "segmento": "Ind Alimentos",
    "produto": "Pallet Higiênico",
    "quantidade": 300,
    "urgencia": "30 dias",
    "cidade_uf": "Itajaí/SC"
  },
  "motivo": "Cliente com volume recorrente e prazo definido.",
  "distribuir": true
}
```

Comportamento:

1. Se a conversa **ainda não tem lead**, cria em `public.leads` com:
   - `company` ← `dados.empresa` (fallback: `name` da conversa ou
     `"WhatsApp <phone>"`)
   - `contact_name` ← `dados.contato` (fallback: `name` da conversa)
   - `phone` e `telefone_whatsapp` ← `phone` da conversa
   - `product`, `quantity`, `segment` ← campos correspondentes
   - `stage = 'novo'`, `origem = 'whatsapp'`,
     `source = 'WhatsApp IA'`, `tags = ['WhatsApp','IA']`
   - `notes` ← concat de `motivo`, `urgencia`, `cidade_uf` e prévia da
     última mensagem
   - `owner_id = null` (entra na fila)
2. Vincula `whatsapp_conversas.lead_id`, muda `status = 'qualificado'`
   e `ia_ativa = false` (o n8n para de responder essa conversa).
3. Se `distribuir = true`:
   - Chama a função de banco `atribuir_proximo_vendedor(lead_id)`
     (round-robin em `fila_vendedores.ativo = true`).
   - Atualiza `leads.owner_id` e `stage = 'qualificacao'`.
   - Registra em `lead_ai_actions` (`type='qualify'`) com
     `metadata.distribuido = true` e `vendedor_id`.
4. Se `distribuir = false` (ex.: fora do horário comercial no n8n):
   - **Não** chama a função de fila.
   - Registra em `lead_ai_actions` (`type='qualify'`) com
     `metadata.aguardando_distribuicao = true`. Um job posterior (ou o
     próprio n8n num horário programado) reprocessa com
     `distribuir = true`.

Respostas:

```json
// 200 OK — distribuído
{ "ok": true, "lead_id": "b12a…", "vendedor_id": "8de1…", "distribuido": true }

// 200 OK — aguardando distribuição
{ "ok": true, "lead_id": "b12a…", "vendedor_id": null,   "distribuido": false }

// 200 OK — tentou distribuir mas a fila estava vazia
{ "ok": true, "lead_id": "b12a…", "vendedor_id": null, "distribuido": false,
  "erro_distribuicao": "Nenhum vendedor ativo na fila" }
```

| Status | Situação                                        |
|--------|-------------------------------------------------|
| 200    | qualificação registrada (com ou sem distribuição)|
| 400    | body inválido / `conversa_id` ausente            |
| 401    | `x-n8n-secret` inválido                          |
| 404    | conversa não encontrada                          |
| 500    | falha ao criar o lead                            |

---

## 5. Enums canônicos (usados nos dados)

| Enum                 | Valores                                                                                       |
|----------------------|-----------------------------------------------------------------------------------------------|
| `lead_stage`         | `atendimento` \| `novo` \| `qualificacao` \| `proposta` \| `negociacao` \| `ganho` \| `perdido` |
| `interaction_type`   | `email` \| `call` \| `meeting` \| `note` \| `whatsapp`                                        |
| `ai_action_type`     | `followup` \| `schedule` \| `qualify` \| `reply` \| `alerta` \| `resumo`                       |
| `conversa_status`    | `ia_atendendo` \| `humano_atendendo` \| `qualificado` \| `encerrado`                          |
| `msg_direcao`        | `entrada` \| `saida`                                                                          |
| `msg_autor`          | `cliente` \| `ia` \| `vendedor`                                                               |

---

## 6. Fluxo canônico WhatsApp

1. Cliente manda mensagem → Z-API → `POST /api/public/zapi/webhook`
   grava em `whatsapp_conversas` + `whatsapp_mensagens` (autor
   `cliente`, direção `entrada`).
2. Se `ia_ativa = true` e `status = 'ia_atendendo'`, CRM dispara
   fire-and-forget para `N8N_WEBHOOK_URL` com o payload da seção 2.
3. n8n valida `x-n8n-secret`, chama o LLM com o `historico`.
4. n8n decide:
   - **Responder** → `POST /api/public/hooks/ia-responder`.
   - **Qualificar** → `POST /api/public/hooks/ia-qualificar`
     (com `distribuir = true` em horário comercial,
     `distribuir = false` fora dele).
5. Ao qualificar, o CRM desliga a IA da conversa e (se distribuído)
   atribui o próximo vendedor da fila. A conversa aparece "Qualificado"
   em `/atendimento-ia` para o vendedor dono ou para todos os admins.

---

## 7. Regras que o n8n NUNCA deve violar

- Só responder quando **ele mesmo** foi convocado pelo webhook de saída
  (a conversa estava `ia_atendendo` + `ia_ativa`). Se `POST /ia-responder`
  retornar **409**, encerre o fluxo daquela conversa.
- Nunca chamar `ia-responder` para conversas em `humano_atendendo`,
  `qualificado` ou `encerrado` — o vendedor já assumiu.
- Nunca gravar direto no banco: **não há service role exposto**. Toda
  ação passa pelos dois endpoints acima.
- Nunca logar / repassar o `N8N_SECRET` fora do próprio nó HTTP do n8n.
- Não inserir `lead_ai_actions` com `type='resumo'` — reservado ao
  motor Xerife interno.

---

## 8. FAQ

**P: Onde configuro `N8N_SECRET` e `N8N_WEBHOOK_URL`?**
R: No projeto Lovable Cloud, em **Backend → Secrets**. `N8N_SECRET` já
foi gerado automaticamente (64 hex). `N8N_WEBHOOK_URL` você preenche com
a URL do webhook do fluxo no n8n. No n8n, use o mesmo valor de
`N8N_SECRET` para validar entradas e assinar chamadas de volta.

**P: O CRM tenta de novo se o n8n cair?**
R: Não. A notificação de saída é fire-and-forget. Se o n8n estava fora
do ar, a mensagem fica só gravada e o próximo evento retoma o fluxo.
Se precisar de retry, faça no lado do n8n (fila interna).

**P: Como envio mídia (imagem/áudio)?**
R: Nesta fase só texto está mapeado. `whatsapp_mensagens` precisaria de
colunas extras para mídia.

**P: A IA pode iniciar conversa (fora de um turno do cliente)?**
R: Sim — o n8n pode chamar `/ia-responder` desde que a conversa exista
e esteja `ia_ativa = true`. O CRM envia via Z-API e grava a mensagem.

**P: Como sei o telefone bruto para enviar?**
R: O CRM já usa `whatsapp_conversas.phone` internamente e normaliza
para DDI 55 antes de mandar ao Z-API. O n8n só precisa do
`conversa_id`.
