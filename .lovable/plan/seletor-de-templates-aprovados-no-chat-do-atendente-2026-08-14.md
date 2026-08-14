# Seletor de templates aprovados no chat do atendente

## Como a janela de 24h é calculada por conversa

Regra: a janela está ABERTA se existe mensagem com `autor='cliente'` (direção `entrada`) na conversa nas últimas 24h.

- Fonte: `whatsapp_mensagens` filtrada por `conversa_id`, `autor='cliente'`, `created_at >= now()-24h` (mesma semântica do `janelaAtendimentoAberta` atual, que hoje agrega por telefone).
- No servidor, o motor continua decidindo por telefone (não muda). Para o composer, uma nova server function retorna, para uma conversa específica: `{ janelaAberta, expiraEm, ultimaInboundEm, primeiroNomeSugerido }`.
- O front consulta isso ao abrir a conversa e revalida quando chega nova mensagem (mesma invalidação de query já usada pela thread), sem timer próprio.
- A decisão final é sempre reconfirmada no servidor no momento do envio; a UI é só orientação.

## Arquivos a alterar

1. `src/lib/whatsapp-cloud.server.ts`
   - Novo `cloudListarTemplatesAprovados()`: GET `{WABA_ID}/message_templates?status=APPROVED&limit=100`, cache em memória de ~5 min, retorno normalizado: `{ name, language, category, bodyText, variaveis: number, exemplos: string[], suportado: boolean, motivoNaoSuportado?: string }`.
   - `suportado=false` quando o template exige header de mídia dinâmica ou botão de URL dinâmico (v1 não trata). Botões fixos → suportado.

2. `src/lib/whatsapp-template.ts`
   - `contarVariaveis(body)`, `aplicarVariaveis(body, params)` para o preview, e reuso de `sanitizarParametro` / `montarComponenteBody`.

3. `src/lib/whatsapp-template.test.ts`
   - Testes de contagem de variáveis, preview e recusa de parâmetro vazio.

4. `src/lib/canais.functions.ts`
   - `listarTemplatesAprovados` (server fn autenticada, chama o helper Cloud).
   - `statusJanelaConversa({ conversaId })` → objeto descrito acima.
   - `enviarTemplateConversa({ conversaId, templateName, lang, params[] })`:
     - valida permissão na conversa (RLS via `context.supabase`);
     - valida que o template está na lista APPROVED e é suportado, e que a quantidade de params bate;
     - **respeita a janela 07:00–20:00 e bloqueio de domingo sempre** (sem `ignorarJanelaHorario`), além de opt-out, disjuntor e rate limits do motor;
     - envia por `sendWhatsappText(...)` com `templateOverride: { name, lang, params }` e origem `iniciado_sistema`;
     - grava a mensagem em `whatsapp_mensagens` (`autor='vendedor'`, `direcao='saida'`, conteúdo = texto final renderizado);
     - assume a conversa/desliga IA como o envio de texto já faz;
     - auditoria em `lead_interactions` (quando a conversa tem `lead_id`): `type='whatsapp'`, conteúdo `Template enviado: <nome> — <texto final>`, `owner_id` = atendente.

5. `src/components/atendimento/TemplateMetaDialog.tsx` (novo)
   - Lista os templates aprovados (nome, categoria, prévia do corpo), busca por nome;
   - ao escolher: um campo por variável com placeholder do exemplo da Meta, `{{1}}` pré-preenchido com o primeiro nome do contato, preview do texto final, botão Enviar desabilitado enquanto houver variável vazia;
   - templates não suportados aparecem desabilitados com "não suportado no momento".

6. `src/routes/conversas.tsx` (composer do atendente)
   - Fora da janela: `Textarea` e botão Enviar desabilitados, aviso "Janela de 24h encerrada. Só é possível enviar um modelo aprovado." + botão "Escolher modelo".
   - Dentro da janela: comportamento atual + botão "Modelos" abrindo o mesmo diálogo (o `TemplatesButton` de textos internos continua existindo, separado).

Sem migração de banco. Sem publicação.
