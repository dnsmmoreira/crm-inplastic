# Diagnóstico: vendedor não vê o chat em /atendimento-ia

## 1) O menu mostra "Atendimento IA" para vendedor? SIM
`src/routes/__root.tsx:141` — item com `adminOnly: false` e sem `perm`, então passa no filtro de `src/routes/__root.tsx:166-171`. Não é problema de menu.

## 2) A rota bloqueia por role? NÃO
`src/routes/atendimento-ia.tsx:33-38` — `createFileRoute` sem `beforeLoad`, sem guarda de role/permissão. Qualquer usuário logado entra.

## 3) A query de conversas: causa raiz
`src/routes/atendimento-ia.tsx:90` filtra `.eq("atribuido_para", userId)` quando `role = vendedor`.

Estado real do banco: **27 conversas, 0 com `atribuido_para` preenchido**. Ou seja, a lista do vendedor vem sempre vazia — sem erro, sem RLS negando: simplesmente não há conversa atribuída a ninguém, e não existe UI para o admin atribuir.

### Problema secundário (RLS de mensagens)
Mesmo depois de atribuir uma conversa, o vendedor abre a conversa mas não lê o histórico:

- `whatsapp_conversas` SELECT permite admin **ou `atribuido_para = auth.uid()`** ou dono do lead.
- `whatsapp_mensagens` SELECT/INSERT permite admin **ou dono do lead apenas** — o caso `atribuido_para` ficou de fora.

Consequência: conversa aparece na lista, mensagens voltam vazias e o envio falha por RLS.

## Correções propostas

1. Alinhar as políticas de `whatsapp_mensagens` (SELECT e INSERT) às de `whatsapp_conversas`, incluindo `c.atribuido_para = auth.uid()`.
2. Adicionar no cabeçalho da conversa em `/atendimento-ia` um seletor de vendedor visível só para admin, que grava `atribuido_para`/`atribuido_em` (o gatilho existente já dispara a notificação).
3. Fallback para o vendedor: incluir também as conversas cujo lead pertence a ele (`leads.owner_id = auth.uid()`), não só as atribuídas — assim o vendedor enxerga o que já é dele mesmo sem atribuição manual.
4. Estado vazio explicativo na lista ("Nenhuma conversa atribuída a você") em vez de tela em branco.

## Detalhes técnicos
- Migration: recriar `mensagens select via conversa` e `mensagens insert via conversa` com a condição `atribuido_para`.
- `src/routes/atendimento-ia.tsx`: trocar o `.eq("atribuido_para", userId)` por filtro composto (atribuída a mim OU lead meu) via `.or(...)` com subconsulta de leads do usuário; adicionar `<Select>` de vendedores para admin chamando um novo server fn `atribuirConversa` em `src/lib/atendimento.functions.ts` (com `requireSupabaseAuth` + checagem de admin).
