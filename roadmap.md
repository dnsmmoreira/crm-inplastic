# Isolamento Maxicaixa × INPLASTIC

- [ ] Baseline: contagem de conversas/mensagens WhatsApp visíveis por atendente (antes)
- [ ] Equipe dona do canal: coluna explícita em `equipes` (INPLASTIC marcada)
- [ ] WhatsApp leitura: policies por equipe do dono; conversa sem dono → equipe dona do canal; admin vê tudo
- [ ] WhatsApp escrita: assumir/transferir/devolver IA/enviar — bloquear cross-equipe; destinos de transferência só da equipe
- [ ] Fila de distribuição: `fila_vendedores` + `atribuir_proximo_vendedor` só aceitam equipe dona do canal
- [ ] Placar: filtro por equipe (equipe nula → só a própria pessoa); estado vazio decente
- [ ] Chat: grupo por equipe, remover 5 da Maxicaixa do Grupo Comercial (sem apagar mensagens), trigger por equipe
- [ ] Chat: colegas = mesma equipe OU meu gestor OU sou gestor dele; supervisão do Denis intacta
- [ ] Pendências: escopo todos/equipe/próprio
- [ ] /equipe: aviso em vez de carregamento infinito
- [ ] Testes de regressão + integração no banco
- [ ] Provas: contagens antes/depois por pessoa, zero Maxicaixa no Grupo Comercial, typecheck/suíte/build
