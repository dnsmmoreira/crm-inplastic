# Diagnóstico — lead "Jhow Reis" (FMJ)

Dados reais consultados no banco (nada foi alterado).

Conversa: `fcc605e0-…afb`, telefone 5511930028898, `status = humano_atendendo`, `ia_ativa = false`, `requer_humano = false`, **`atribuido_para = NULL`**, `lead_id = c6df3f40-…`, `leads.owner_id = BEATRIZ`, `leads.product = "pallet vazado em polipropileno"`.
(Existe também uma segunda conversa "Jhow Reis" com phone `132757774696634` — id de grupo/WhatsApp Business — sem lead, ainda em `ia_atendendo`.)

## BUG 1 — Lucas não conseguiu indicar um pallet

Causa raiz: **o agente não tem nenhuma ferramenta de catálogo. Não existe no CRM nenhum endpoint, server fn ou tool MCP que exponha `produtos`/`produtos_omie` para o Lucas.**

- `src/lib/mcp/index.ts:12-22` — o servidor MCP publica só `list_leads`, `list_tasks`, `pipeline_stats`, `xerife_log_recent`, `placar_atual`, `xerife_config_view`. Nenhuma ferramenta de produto, medida, capacidade ou estoque.
- `src/routes/api/public/hooks/` — só há `ia-qualificar`, `ia-responder`, `ia-urgente` e os hooks do Xerife. Nenhum hook de consulta de catálogo.
- `src/routes/api/public/hooks/ia-qualificar.ts:9-21, 107` — o produto viaja como **texto livre** (`dados.produto`) e é apenas gravado em `leads.product`. Não há nenhuma tentativa de casar esse texto com um SKU.

Portanto (b): não é falha de match exato, de estoque ou de medidas — **não há busca nenhuma**. O Lucas só consegue repetir o que o cliente escreveu (é exatamente o que ele fez: "Entendi, você busca um pallet vazado em polipropileno…" e em seguida transferiu).

Agravantes que impediriam a busca mesmo se ela existisse hoje:
- `produtos`: 74 ativos, **73 sem `family`** e **0 com `estoque_atual > 0`** — qualquer filtro por família ou por saldo devolveria vazio.
- As dimensões existem (`height_cm`, `width_cm`, `length_cm`, `weight_kg`), mas não há campo de **carga dinâmica/estática**, material (PP/PEAD), cor ou "vazado x liso" — exatamente os critérios que o Jhow pediu.

O que faltou (c): uma ferramenta de catálogo (MCP tool ou hook `/api/public/hooks/produtos-buscar`) que receba medida/material/tipo/quantidade e devolva SKUs candidatos, além de enriquecer `produtos` com material, tipo de face e capacidade de carga.

## BUG 2 — a conversa não aparece para a Beatriz em /conversas

Causa raiz: **a Beatriz nunca passou por `assumirConversa`. Ela respondeu direto pela caixa de mensagem, e `sendConversaMessage` muda o status para `humano_atendendo` sem nunca gravar `atribuido_para`.**

- `src/lib/canais.functions.ts:46-51` — após enviar, faz `update({ status: "humano_atendendo", ia_ativa: false })`. **Não toca em `atribuido_para`.**
- Histórico confirma: as duas mensagens de saída (14:34 e 17:05 de hoje) têm `autor = vendedor`, `usuario_id = Beatriz`, e a conversa continua com `atribuido_para = NULL`.
- `src/routes/conversas.tsx:152` — a lista filtra `.eq("atribuido_para", userId)`. Com `atribuido_para` nulo, a conversa some para ela.
- Ela **conseguia** ver e responder porque a RLS de `whatsapp_conversas` (política `conversas select`) também permite `leads.owner_id = auth.uid()` — divergência confirmada entre `owner_id` (Beatriz) e `atribuido_para` (nulo). A tela `/conversas` é mais restritiva que a RLS.
- Armadilha adicional: `src/routes/conversas.tsx:567` só mostra o botão **Assumir** quando `ia_ativa && status === 'ia_atendendo'`. Como a primeira resposta dela já derrubou a IA, o botão sumiu — não existe mais nenhum caminho na UI para ela se atribuir.

Respondendo item a item:
- (a) Ficou **NULL** — nem dela, nem de outro vendedor.
- (b) A condição "atribui se órfã" (`src/lib/atendimento.functions.ts:24`) **não** foi o bloqueio neste caso (a conversa era órfã). Ela seria um bloqueio real em outro cenário: conversa já atribuída ao vendedor A, o vendedor B clica Assumir e a atribuição não muda — B some da própria lista.
- (c) Sim, há divergência: o vínculo real é `leads.owner_id`, mas `/conversas` só olha `atribuido_para`.

## Correções sugeridas (não aplicadas)

1. `sendConversaMessage` gravar `atribuido_para = userId` quando estiver nulo (mesma regra do `assumirConversa`).
2. `/conversas:152` incluir também as conversas cujo lead é do usuário (`leads.owner_id = auth.uid()`), alinhando a tela à RLS.
3. Mostrar "Assumir/Assumir para mim" sempre que `atribuido_para` for nulo ou diferente do usuário, não só quando a IA está ativa.
4. Backfill pontual: setar `atribuido_para` a partir de `leads.owner_id` nas conversas humanas órfãs.
5. Para o BUG 1: criar a ferramenta de busca de catálogo e enriquecer `produtos` (material, tipo, carga, família, estoque).
