# Consistência entre lead e cliente (caso ELO)

## 1. Causa exata de cada mensagem

**Mensagem A — "CNPJ já cadastrado para 'ELO SOLUCAO'. Solicite ao ADM a transferência do lead."**
Vem do cadastro de lead em memória (`addLead`, src/lib/crm-store.ts:1156). Ao escolher o **cliente** ELO na tela "Nova proposta", o sistema tenta criar um lead novo para esse cliente (`criarPropostaParaCliente`) porque não encontra lead ligado a ele — o lead ELO existe, mas está ligado ao cliente errado. O cadastro bate no CNPJ repetido e devolve o texto fixo "solicite transferência", sem nunca olhar quem é o dono. Por isso a frase aparece mesmo quando o dono é o próprio Daniel.

**Mensagem B — "…pertence a outro vendedor (ou mudou de dono)."**
Vem de `persistLeadNow` (src/lib/crm-sync.ts:1057), que ao falhar chama `mensagemFalhaLead` direto: qualquer recusa de permissão (inclusive "zero linhas alteradas") vira a acusação de outro dono. É o único caminho que **não** usa o diagnóstico novo — por isso não existe nenhum registro `crm-sync.leads/recusado` em /falhas. A recusa em si é consequência do estado inconsistente do lead (ligação e documento), não da RLS: simulando o Daniel, o UPDATE do lead passa.

**Ajuste:** `persistLeadNow` passa a usar o mesmo caminho do sync — pergunta ao servidor quem é o dono, registra em /falhas e só acusa "outro vendedor" quando o dono for mesmo outro.

**Sobre o `cliente_id` trocado:** não existe histórico dessa coluna, então não dá para afirmar a origem com certeza. O que dá para afirmar: o teste de 13:43 alterou apenas `updated_at` (já conferido), e o caminho que grava o vínculo (`vincularClienteAoLead`) aceita qualquer cliente para qualquer lead, sem conferir documento — é por ali que um cliente de CNPJ diferente entra. O plano fecha esse buraco e cria registro de auditoria de mudança de vínculo.

## 2. Regra única de documento (só dígitos)

- Coluna gerada `cnpj_digits` (e `cpf_digits`) em `leads` e `clientes`, calculada pelo banco a partir do texto — vale para qualquer caminho de gravação, não só a tela.
- Índices únicos pelo valor normalizado; o índice atual `leads_cnpj_uniq` (texto cru) é substituído.
- Migração dos 39 leads com máscara para só dígitos. **Conferido no banco: a normalização não cria nenhuma duplicata** (0 grupos repetidos em leads, 0 em clientes; clientes já estão só com dígitos).
- A tela passa a gravar sempre só dígitos.

## 3. Um cliente por documento, e o lead aponta para ele

- Ao gravar lead com documento que já tem cliente, o vínculo é preenchido automaticamente (o gatilho de carteira já faz isso quando o vínculo está vazio; passa a valer também para lead em etapa ganho/perdido).
- Criar cliente a partir de lead cujo documento já é cliente **do mesmo dono**: em vez do erro "você já tem um cliente com este CNPJ", o sistema liga o lead ao cliente existente e segue.
- Gatilho novo recusa gravar lead com vínculo para cliente de documento diferente (mensagem clara, registrada em /falhas).
- `vincularClienteAoLead` passa a conferir documento e dono antes de gravar.

## 4. Correção de dados (mostrada antes de aplicar)

Nada é alterado sem sua aprovação. O relatório virá com: o lead ELO ligado ao cliente ELO `0982f4b5`; os **20** leads sem vínculo ligados ao cliente do mesmo documento; os **39** leads com máscara normalizados. Conferido: em **2** desses 20 o dono do lead é diferente do dono do cliente — esses ficam de fora e vão numa lista à parte para o Denis decidir.

## 5. Seletor de lead/cliente sem duplicata

Hoje o seletor esconde o cliente só quando algum lead aponta para ele. Passa a esconder também quando o **documento** coincide, e a entrada única leva ao lead. Vale para proposta e para pedido (que nasce da proposta).

## 6. Mensagens

- Dono é a própria pessoa: nunca "solicite transferência" — o sistema liga ao cadastro existente e segue.
- Dono é outro: mensagem publicada hoje, com nome do dono e equipe.

## 7. Testes (todos em transação com ROLLBACK)

- Daniel cria proposta/pedido para a ELO sem erro, pelos dois caminhos (pelo lead e pelo cliente).
- Criar cliente a partir de lead cujo documento já é cliente dele liga ao existente.
- CNPJ com e sem máscara = mesmo registro.
- Lead apontando para cliente de documento diferente é recusado.
- Regressão: leads/clientes visíveis para Daniel, Pamela, Lais, Ana e admin com contagens idênticas.

## Detalhe técnico

- `src/lib/crm-store.ts` (`addLead`/`updateLead`): duplicidade deixa de ser texto fixo; devolve o dono e reaproveita o registro quando é do próprio usuário.
- `src/lib/crm-sync.ts` (`persistLeadNow`): usa `avisarLeadRecusado`/`diagnosticarLeadRecusado`, igual ao sync.
- `src/hooks/use-criar-proposta-para-cliente.ts`: procura lead por documento além de `clienteId`, antes de criar lead novo.
- `src/lib/clientes.functions.ts`: `criarClienteCore` com `duplicate_active` do mesmo dono passa a vincular e devolver `ok`; `vincularClienteAoLead` valida documento/dono.
- Migração: colunas geradas + índices únicos normalizados + gatilho de coerência lead↔cliente + ampliação do preenchimento automático do vínculo.
- Script de correção de dados em arquivo, executado só depois da sua aprovação.
- Ao final: saída real de `bunx tsgo --noEmit`, `bunx vitest run` e `bun run build`. Nada publicado.
