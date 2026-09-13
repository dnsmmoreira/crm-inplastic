# Blindagem dos 4 achados: DIFAL, avisos, etapas de lead e dono da tarefa

Objetivo: transformar as correções recentes em regras permanentes — testes que
falham se alguém reintroduzir o problema, um aviso visível quando falta o estado
(UF) do cliente, e registro de falhas de permissão do banco com o contexto da ação.

## 1. Estado (UF) faltando — aviso na proposta e trava ao gerar pedido

- Nova pendência `cliente_sem_uf` na lista de conferência: "Cliente sem estado
  (UF) — o imposto DIFAL não pode ser calculado." Com link para o cadastro do
  cliente/lead, igual às demais pendências.
- A tela da proposta passa a mostrar um aviso destacado no bloco de totais
  quando não há UF, deixando claro que o total pode estar sem o imposto.
- Ao gerar o pedido, a mesma verificação roda no servidor com os dados do banco:
  sem UF o pedido não é criado.
- O cálculo do imposto no servidor lê o estado do cadastro do cliente e, se não
  houver, do endereço do lead (mesma precedência que a tela usa), de modo que o
  total gravado no pedido é idêntico ao aprovado na proposta.

## 2. Registro de falhas de permissão do banco

- Novo utilitário de gravação monitorada: quando um `insert` é recusado pelo
  banco por regra de acesso, a falha é registrada na tela de Falhas com origem
  própria (`rls.notificacoes`, `rls.user_audit_log`) e o contexto da ação
  (quem disparou, tipo de aviso, pedido/proposta envolvida, quantidade de linhas).
- Aplicado nos pontos de gravação de avisos e de auditoria de usuários.
- Como a tela de Falhas já agrupa por origem + mensagem, o número de ocorrências
  vira o contador de reincidência.

## 3. Dono da tarefa preservado

- Reforço explícito no salvamento: tarefa já existente nunca envia `owner_id`;
  concluir/reabrir passa só pelo caminho de servidor.
- Teste de regressão que falha se `owner_id` voltar ao payload de atualização.

## 4. Testes de regressão

Novos testes cobrindo:
- imposto DIFAL usando o estado vindo do endereço do lead e do cadastro do cliente,
  inclusive isenção;
- pendência de UF ausente bloqueando a geração do pedido;
- avisos gravados pelo caminho de serviço (não pelo usuário), incluindo a opção
  de não reembrulhar quando o chamador já é serviço;
- mudança de etapa de lead passando pela função de sistema (nunca gravação direta);
- gravação monitorada registrando falha de permissão com contexto.

## Detalhes técnicos

- `src/lib/pedido-pendencias.ts`: novo código `cliente_sem_uf` + campo `uf` em
  `PendenciaInput.cliente`; `src/routes/propostas.$id.tsx` e
  `src/lib/pedidos-gerar.functions.ts` passam a UF (cliente → `lead.endereco.uf`).
- `src/lib/difal.server.ts`: mantém fallback `leads.endereco.uf/estado`; testes
  ampliados em `difal.server.test.ts`.
- Novo `src/lib/rls-monitor.server.ts` com `inserirMonitorado(sb, tabela, linhas,
  contexto)` usando `registrarFalhaAdmin`; usado em `pedidos-fluxo.server.ts`
  (`notificarUsuarios`), `equipe.functions.ts` (`cobrarPessoa`) e nos inserts de
  `user_audit_log`.
- Novos arquivos de teste: `rls-monitor.test.ts`, `crm-sync-tarefa-owner.test.ts`,
  `pedido-pendencias-uf.test.ts` (ou casos adicionados aos testes existentes) e
  casos em `difal.server.test.ts`.
- Sem migração de banco; nenhuma policy alterada. Ao final: `bunx vitest run` e
  `bunx tsgo --noEmit`.
