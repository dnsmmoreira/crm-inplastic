# "Geral" vira painel de acompanhamento da diretoria

Hoje o canal "Geral" tem só o Denis como membro, então nunca chega mensagem lá e o item abre um canal vazio. A proposta troca esse canal vazio por uma **lente de leitura**: quem tem a permissão de administração vê, dentro de `/chat-interno`, todas as conversas do time (DMs entre outras pessoas + Grupo Comercial) e pode ler cada uma inteira, sem responder e sem interferir.

Nada muda para quem só usa o chat normalmente.

## Quem pode ver

Gate pela permissão já existente `usuarios.gerenciar` (a mesma usada em Equipe, Usuários, Perfis e nas escalações do Xerife). Nada preso ao id do Denis — se outra pessoa receber essa permissão, passa a enxergar também.

O gate é verificado **no servidor**, dentro das funções novas (`tem_permissao(auth.uid(), 'usuarios.gerenciar')`), e repetido na tela só para decidir o que desenhar. Sem a permissão, o item "Geral" continua se comportando como hoje.

## Como fica a tela

Ao clicar em "Geral" na coluna da esquerda, em vez do canal de postagem:

```text
Geral (acompanhamento)
┌───────────────────────────┬──────────────────────────────┐
│ Conversas do time         │ Pamela ↔ Renata              │
│ • Pamela ↔ Renata   15/09 │ (somente leitura)            │
│ • Grupo Comercial   15/09 │  ...histórico da conversa... │
│ • Kelly ↔ Bruna     12/09 │                              │
└───────────────────────────┴──────────────────────────────┘
```

- Lista de conversas ativas com participantes, data e prévia da última mensagem, mais recente no topo. O próprio "Geral" não entra na lista.
- Clicar abre a conversa inteira em modo leitura, com paginação igual à do chat normal (últimas mensagens primeiro, "carregar anteriores" ao subir).
- **Sem caixa de digitar, sem anexar, sem marcar como lida.** Nenhuma escrita: o `last_read_at` de terceiros não é tocado, nada de badge ou som para essas conversas (contagem de não lidas continua só das conversas de quem está logado).
- Rótulo visível de "somente leitura / acompanhamento" no topo, para não dar a impressão de que dá para responder.

## Anexos

Mesmo padrão de hoje: a URL assinada é gerada só quando a bolha entra na tela, uma por vez, e vale ~1h. Não existe endpoint que liste anexos em lote.

Ponto que exige mudança: a regra de acesso ao arquivo hoje é `pode_acessar_anexo_chat()`, que exige ser membro do canal — sem ajuste, o preview de anexo nas conversas de terceiros falharia. A função ganha uma segunda condição: membro do canal **ou** portador de `usuarios.gerenciar`. Continua sendo arquivo por arquivo, sob demanda.

## O que não muda

DM e Grupo Comercial seguem idênticos: envio, realtime, leitura, notificações, expurgo de anexos em 15 dias. A RLS normal de `chat_mensagens` / `chat_canais` / `chat_canal_membros` continua exatamente como está, via `chat_e_membro()`. A lente nova não afrouxa nada dela — ela passa por funções separadas que checam a permissão.

## Detalhes técnicos

**Migration** (sem alterar tabela nem policy existente):

1. `chat_supervisao_conversas()` — SECURITY DEFINER, `GRANT EXECUTE TO authenticated`, `REVOKE FROM public, anon`. Primeira linha: se `NOT tem_permissao(auth.uid(),'usuarios.gerenciar')` então `RAISE EXCEPTION`. Retorna, para todo canal com `tipo <> 'geral'`: `canal_id, tipo, nome, participantes (array de nome), ultima_em, ultima_previa (conteúdo ou 📎 nome do anexo), total_mensagens`. Ordena por `ultima_em desc`.
2. `chat_supervisao_mensagens(_canal_id uuid, _antes timestamptz default null, _limite int default 40)` — mesmo gate e mesmos grants; recusa `tipo = 'geral'`; devolve as colunas já usadas na tela (`id, canal_id, autor_user_id, autor_nome, conteudo, criado_em, anexo_path, anexo_nome, anexo_tipo, anexo_tamanho_bytes`) em ordem decrescente, com `limite` teto de 100.
3. `CREATE OR REPLACE FUNCTION pode_acessar_anexo_chat(_name text)` — acrescenta `OR tem_permissao(auth.uid(),'usuarios.gerenciar')` ao retorno.

**Server functions** em `src/lib/chat-supervisao.functions.ts`, ambas com `requireSupabaseAuth`, chamando as RPCs pelo client do usuário (o gate real fica no banco, fail-closed):
`listarConversasSupervisao()` e `mensagensSupervisao({ canalId, antes })`.

**Puras** em `src/lib/chat-supervisao.ts`: montar o título da conversa a partir dos participantes (`"Pamela ↔ Renata"`, nome do grupo quando houver), ordenação e recorte da prévia — com testes.

**Tela**: em `src/routes/chat-interno.tsx`, quando o item selecionado é `tipo === "geral"` e a pessoa tem a permissão, renderiza um componente novo `PainelSupervisao` no lugar da thread + composer. Reaproveita `AnexoMensagem`, `mesclarHistorico` e a rolagem existente. Sem permissão, o comportamento atual permanece.

**Testes**: puras de título/ordenação; verificação no banco de que um usuário sem `usuarios.gerenciar` recebe erro ao chamar as duas funções e que um com a permissão recebe as conversas.

## Fora do escopo

Busca dentro do painel de acompanhamento, exportação de conversas, registro de auditoria de "quem leu o quê" e atualização em tempo real do painel (será leitura sob demanda, com refresh ao abrir). Dá para incluir depois se o Denis pedir.
