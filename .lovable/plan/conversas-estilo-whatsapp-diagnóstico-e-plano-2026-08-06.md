# /conversas estilo WhatsApp — diagnóstico e plano

## 1) Como a lista é montada hoje

`src/routes/conversas.tsx:63-90` (`load`): um `select("*")` em `whatsapp_conversas`, ordenado por `last_message_at` (nulls por último), limite 200, filtrado por `atribuido_para = userId` — exceto admin com "Ver todas" marcado (`:70`).

Campos disponíveis na tabela: `id`, `phone`, `name`, `lead_id`, `status` (`ia_atendendo` | `humano_atendendo` | `qualificado` | `encerrado`), `ia_ativa`, `last_message_preview`, `last_message_at`, `requer_humano`, `motivo_handoff`, `atribuido_para`, `atribuido_em`, `created_at`, `updated_at`.

Renderização do item: `:165-208` (avatar com iniciais, nome, tempo relativo, preview, badge).

## 2) Não lidas e último autor

- **Não lidas**: não existe coluna. Hoje é derivado de `notificacoes` (`:78-89`) — contagem de linhas com `lida_em IS NULL` agrupadas por `conversa_id`. Só conta o que gerou notificação, então subestima.
- **Último autor**: não existe coluna. Dá para derivar de `whatsapp_mensagens` (`autor`: `cliente` | `ia` | `vendedor`; `direcao`: `entrada` | `saida`; `created_at`). Ou seja: a última mensagem por conversa define "aguardando" quando `autor = 'cliente'`.

## 3) Onde adicionar cada item

- (a) **Abas "Atendendo" / "Aguardando" com contador** — dentro do bloco de filtros `:143-163`, logo abaixo do campo de busca; o filtro entra no `useMemo` de `filtradas` (`:112-118`), somando `aguardando` + `atendendo` a partir do mapa derivado.
- (b) **Horário da última mensagem** — já existe o tempo relativo em `:185-192`; trocar por hora (`HH:mm` no mesmo dia, `dd/MM` em dias anteriores), estilo WhatsApp.
- (c) **Badge de não lidas sobre o avatar** — hoje o badge fica na segunda linha (`:198-202`); mover para o `<span>` do avatar em `:179-181`, com `relative` no avatar e badge `absolute -top-1 -right-1`.
- (d) **Destaque de conversas aguardando** — no `className` do botão `:174-177`: borda esquerda de destaque, fundo sutil e nome em negrito quando `aguardando`; ponto colorido opcional ao lado do preview.

## 4) Como calcular "aguardando" sem quebrar o realtime

Adicionar ao `load` (junto ao bloco de notificações, `:78-89`) uma segunda consulta a `whatsapp_mensagens` restrita aos ids das conversas já carregadas:

```
select id, conversa_id, autor, created_at
from whatsapp_mensagens
where conversa_id in (<ids da página>)
order by created_at desc
limit 2000
```

Percorrendo o resultado em ordem decrescente e guardando o primeiro registro de cada `conversa_id`, obtém-se o último autor por conversa em uma única ida ao banco. Estado novo `ultimoAutor: Record<string, "cliente"|"ia"|"vendedor">`.

Isso não mexe no realtime: o canal de `:94-104` já reexecuta `load()` a cada INSERT em `whatsapp_mensagens` e a cada mudança em `whatsapp_conversas`, e o `setInterval` de 8s continua como rede de segurança. Nenhuma assinatura nova é criada.

Também derivamos o contador de não lidas de forma mais fiel no mesmo passo: contar mensagens de `autor = 'cliente'` posteriores à última mensagem de `autor != 'cliente'` — mantendo o número de `notificacoes` como fallback quando não houver mensagens carregadas.

Definições das abas:
- **Aguardando**: último autor = `cliente` (o vendedor precisa responder).
- **Atendendo**: as demais (última fala foi da IA ou do vendedor).

## Notas técnicas

- Sem migração de banco: tudo derivado de `whatsapp_mensagens`. Se o volume crescer, o passo seguinte natural seria uma coluna `ultimo_autor` mantida por trigger — fora do escopo agora.
- Alterações ficam restritas a `src/routes/conversas.tsx`; `/atendimento-ia` continua intacta.
- Layout mobile preservado (a tela está sendo usada em 443px de largura).
