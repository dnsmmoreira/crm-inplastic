
## Bloco 7 — acabamento "Nada fica sem próximo ato" (concluído)
- Vencimento por rolagens (tarefa-vencimento.ts) em E1, painel Equipe, fechamento e Minha Agenda
- Desfecho "transferir" + motivos estruturados de "sem pendência"
- Aviso 24h antes de devolver o lead à fila (D1)
- Faixa "sem resposta agora" em /conversas
- Avisos informativos somem em 7 dias (cron diário)

## Bloco 6 — "Nada fica sem próximo ato" (concluído)
- [x] E1: escalação de tarefas vencidas para o gestor/admins (xerife-engine) + E2 aceites sem canal
- [x] Painel /equipe (resumoEquipe, cobrarPessoa, card "sem próximo ato") + item no menu
- [x] Fechamento do dia: seção "SEM PRÓXIMO ATO" (extrair equipe.server.ts)
- [x] Fora do horário: auto-resposta única + tarefa resposta_pendente na abertura (fora-horario.ts)
- [x] Testes: fora-horario, agregação equipe, E1

## Bloco 9 — Carteira do vendedor é a âncora (concluído)
- [x] `localizar_carteira` + `tel_chave` no banco e `carteira-match.ts` puro (com testes)
- [x] Trigger de carteira no lead novo (dono, cliente, tag e nota no histórico)
- [x] CNPJ que chega depois: tarefa `transferir_carteira` (1 dia) + avisos ao dono da carteira e ao gestor
- [x] Conversas do WhatsApp: cliente da casa vai direto ao dono, sem IA e sem fila
- [x] D1: carteira/pedido/proposta travam a devolução; fila que devolve ao mesmo dono escala ao gestor
- [x] `transferir_cliente` + `transferir_lead` levam a carteira junto; botão "Transferir carteira" em /clientes
- [x] Seção "Carteira" em /equipe com transferência na mesma tela

## Bloco Kelly-1 — Representantes com acesso (em curso)
- [x] Permissão `representantes.gerenciar` (Administrador + Gestor Comercial)
- [x] Tela /representantes (roster, contagens em lote) + item no menu
- [x] Salvar usuário com cargo Representante garante linha em arena_participacao
- [ ] Comissão/região: aguardando decisão do Denis sobre o motor da Arena

## Salvamento de tarefas — repetição limitada (concluído)
- [x] Diagnóstico: gravação recusada ao tentar mover a tarefa para o dono do lead (tarefas do Xerife têm dono próprio)
- [x] Nova tentativa automática com espera progressiva (2s/8s/20s), máximo de 3 por coleção
- [x] Ao esgotar: para de tentar, descarta o pendente e recarrega só aquela coleção
- [x] Aviso novo, sem "recarregue a página"
- [x] Testes (sync-retry, sync-falhas) + typecheck

## Contato duplicado — porta de entrada única (em curso)
- [ ] `resolverContatoEntrada`: casa telefone (DDD+8) e CNPJ contra carteira e leads ativos antes de criar lead
- [ ] Usar em WhatsApp, lead externo (OPA) e cadastro manual
- [ ] Nome/empresa só geram aviso de possível duplicidade
- [ ] Teste de aceitação com 1205330c / 97df561a
- [ ] DIFAL/Inscrição Estadual: aguardando as 4 decisões fiscais do Denis
