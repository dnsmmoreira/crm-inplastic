# Chat Interno: Grupo Comercial, anexos e limpeza automática

Tudo entra junto com o que ainda não foi publicado. Nada será publicado sem sua revisão do diff.

## 1. Grupo Comercial (aberto a todo o time)

- Novo tipo de canal `grupo` (estrutura genérica, sem amarrar ao nome "comercial").
- Um canal `Grupo Comercial` criado com id fixo.
- Todos os perfis ativos entram como membros (backfill) e quem for ativado depois entra sozinho.
- O canal "Geral" continua exatamente como está: só o Denis.
- Na tela, o Grupo Comercial aparece fixo no topo da lista, como o Geral aparecia antes, com nome do autor em cada mensagem.

## 2. Anexos nas conversas (DM e grupos)

- Botão de anexo no campo de escrita; imagem aparece em miniatura dentro da bolha, outros arquivos viram um chip com nome, tamanho e link para abrir/baixar.
- Limite de 15 MB por arquivo, checado antes do envio e reforçado no próprio armazenamento.
- Tipos aceitos: imagens, PDF, Word/Excel/PowerPoint, CSV e texto. Executáveis e qualquer outro tipo são recusados.
- Mensagem pode ser só o anexo, sem texto. Texto continua limitado a 4000 caracteres.
- Só quem participa da conversa consegue enviar ou abrir o arquivo daquela conversa.

## 3. Limpeza automática em 15 dias

- 15 dias corridos depois da mensagem, o arquivo é apagado de verdade do armazenamento e os campos de anexo daquela mensagem ficam vazios.
- O texto e o histórico da conversa permanecem; na bolha antiga fica a indicação "anexo removido".
- O projeto já tem agendamento interno disponível, então o job roda sozinho, **uma vez por dia**, sem você precisar agendar nada por fora. Uma vez ao dia é a menor frequência que atende a regra: o atraso máximo entre "completou 15 dias" e "arquivo apagado" é de 24 horas, e evita manter o banco acordado com verificações frequentes (o que aumentaria o custo recorrente).

---

## Detalhes técnicos

### Migração A — Grupo Comercial
- `chat_canais`: trocar o CHECK de `tipo` para `IN ('geral','direto','grupo')`. O CHECK `par_chave` coerente já cobre `tipo <> 'direto'`.
- `INSERT` de uma linha `tipo='grupo'`, `nome='Grupo Comercial'` com UUID literal fixo na migração (idempotente com `ON CONFLICT (id) DO NOTHING`).
- Índice único parcial em `nome` para `tipo='grupo'`, evitando duplicidade futura.
- Backfill: `INSERT INTO chat_canal_membros (canal_id, user_id) SELECT <id fixo>, id FROM profiles WHERE ativo AND deleted_at IS NULL ON CONFLICT DO NOTHING`.
- `tg_profiles_entra_no_grupo_comercial()` SECURITY DEFINER + trigger AFTER INSERT/UPDATE em `profiles`: quando `ativo = true AND deleted_at IS NULL`, insere a linha com `ON CONFLICT DO NOTHING`, envolvido em `EXCEPTION WHEN OTHERS THEN NULL` (nunca derruba a gravação do perfil). `REVOKE EXECUTE` de `PUBLIC`/`anon`/`authenticated`, como nos demais triggers do chat.

### Migração B — Campos de anexo
- `chat_mensagens`: `anexo_path text`, `anexo_nome text`, `anexo_tipo text`, `anexo_tamanho_bytes bigint`, todos nullable.
- Substituir `chat_mensagens_conteudo_check` por:
  `CHECK (char_length(conteudo) <= 4000 AND (char_length(btrim(conteudo)) > 0 OR anexo_path IS NOT NULL))`.

### Bucket e políticas
- Bucket `chat-anexos`, privado, limite de 15 MB (criado pela ferramenta de storage, não por SQL).
- `public.pode_acessar_anexo_chat(_name text) returns boolean` SECURITY DEFINER: extrai o primeiro segmento do path (`split_part(_name,'/',1)`), valida como UUID e retorna `public.chat_e_membro(canal_id, auth.uid())`; retorna false se o path não tiver formato esperado. EXECUTE só para `authenticated`.
- Policies em `storage.objects` para SELECT/INSERT/UPDATE/DELETE com `bucket_id = 'chat-anexos' AND pode_acessar_anexo_chat(name)`.
- Path: `<canal_id>/<uuid>-<nome sanitizado>` (reaproveita `nomeArquivoSeguro`).

### Frontend
- `src/lib/chat-interno.ts`: `montarListaChat` passa a aceitar canais `grupo` (fixos no topo, junto com `geral`, ordenados por nome); tipos `ChatCanalResumo`/`ChatItemLista` ganham `nome` e `tipo: 'geral'|'direto'|'grupo'`. Novas puras: `MAX_BYTES_ANEXO_CHAT = 15MB`, `TIPOS_ANEXO_CHAT` (allowlist de mime), `validarAnexoChat(file)`, `caminhoAnexoChat(canalId, nome, uid)`, `ehImagemAnexo(mime)`. Testes em `chat-interno.test.ts`.
- `src/lib/chat-interno.functions.ts` (`resumoChatInterno`): selecionar também `nome` de `chat_canais` e mapear `grupo`; prévia da lista mostra o nome do arquivo quando a mensagem não tem texto.
- `src/routes/chat-interno.tsx`: botão de clipe + input de arquivo no composer, validação de tamanho/tipo antes do upload, upload para `chat-anexos` e insert da mensagem com os campos `anexo_*` (erro de upload aborta sem criar mensagem órfã); na bolha, imagem via URL assinada (`createSignedUrl`, ~1h, em cache local) e chip com nome/tamanho para os demais; nome do autor exibido em `geral` e `grupo`; mensagem cujo anexo já foi expurgado mostra "anexo removido".
- Badge do menu e `CHAT_QUERY_KEY` não mudam.

### Expurgo (15 dias)
- Nova pura em `src/lib/chat-interno.ts`: `anexosChatExpirados(linhas, agora)` (15 dias, só linhas com `anexo_path`), com teste.
- Novo endpoint `POST /api/public/hooks/chat-anexos-expurgo` seguindo exatamente o padrão de `documentos-expurgo.ts`: `requireXerifeCronAuth` (`x-xerife-secret`), `supabaseAdmin`, lote de 200, remove do bucket e zera `anexo_path/nome/tipo/tamanho_bytes`, falhas registradas via `registrarFalhaSegura` (aparecem em `/falhas`).
- Agendamento: `pg_cron` já está habilitado no projeto (junto com `pg_net`), então a migração cria o job diário `chat-anexos-expurgo` às 06:00 UTC chamando o endpoint via `net.http_post` com o header do segredo — mesmo caminho já usado pelas rotinas do Xerife, sem agendamento externo da sua parte. O endpoint fica disponível caso você queira disparar manualmente.

### Verificação
- `bunx vitest run` + `bunx tsgo --noEmit`.
- Teste no navegador: envio de imagem e de PDF numa DM e no Grupo Comercial, e checagem de que um não-membro não abre o arquivo.
- Diff completo (código + migrações) entregue para revisão. Sem publicar.
