# Corrigir falha repetitiva ao salvar tarefas

## Diagnóstico confirmado
- A regra de acesso de `tarefas` permite gravação apenas pelo responsável da tarefa ou por administrador.
- Existem tarefas legítimas do Xerife/fluxo operacional cujo responsável difere do responsável do lead.
- O sync antigo reconstruía `owner_id` a partir do lead; ao salvar uma dessas tarefas, tentava transferi-la indevidamente e recebia erro `42501` de RLS.
- Erros permanentes ficavam no snapshot local e reapareciam em novos ciclos. O código atual já preserva o responsável real e recarrega a verdade do servidor após recusas permanentes.
- Os logs históricos do Data API não expõem o corpo da resposta ao painel de logs; o diagnóstico é confirmado pela policy, pelo payload antigo e pelas 22 tarefas abertas com ownership legitimamente divergente hoje.

## Implementação
1. Manter a correção existente que preserva `tarefa.owner_id` e classifica RLS/constraints como erro permanente.
2. Adicionar retry transitório limitado, com espera progressiva e máximo de 3 tentativas por coleção.
3. Após esgotar tentativas, parar o loop, descartar apenas o estado recusado e recarregar a coleção do servidor, sem bloquear as demais coleções.
4. Ajustar o aviso: tentativa transitória informa nova tentativa; esgotamento informa que a tela foi atualizada, sem toast infinito pedindo recarga manual.
5. Adicionar testes do contador, espera, reset após sucesso e esgotamento.
6. Rodar a suíte completa e o typecheck. Não alterar RLS/policies.

## Arquivos previstos
- `src/lib/crm-sync.ts`
- `src/lib/sync-falhas.ts`
- Novo helper/testes de retry em `src/lib/`
- `roadmap.md`
