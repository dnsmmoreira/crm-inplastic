
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
