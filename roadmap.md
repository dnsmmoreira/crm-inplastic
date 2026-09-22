# Isolamento Maxicaixa × INPLASTIC

- [x] Baseline de conversas/mensagens por atendente (antes)
- [x] Equipe dona do canal marcada em `equipes` (INPLASTIC)
- [x] WhatsApp leitura por equipe; conversa sem dono → equipe dona do canal; admin vê tudo
- [x] WhatsApp escrita: trava por equipe em assumir/devolver/transferir/encerrar/espera/retomar
- [x] Destinos de transferência limitados à equipe do ator (admin vê todos)
- [x] Fila de distribuição restrita à equipe dona do canal (trava + escolha)
- [x] Placar por equipe (equipe nula → só a própria pessoa) + estado vazio
- [x] Chat: Grupo Comercial só INPLASTIC, Grupo Maxicaixa criado, trigger por equipe
- [x] Chat: colegas = mesma equipe OU meu gestor OU quem eu lidero; supervisão intacta
- [x] Pendências com escopo empresa/equipe/próprio
- [x] /equipe com aviso claro em vez de carregamento infinito
- [x] Teste de integração do isolamento contra o banco
- [x] Provas: contagens antes/depois, Grupo Comercial sem Maxicaixa, typecheck/suíte/build

Pendente com o Denis: senha do Luciano; catálogo/estoque/transportadoras/DIFAL seguem compartilhados.

## Cadastro de leads/clientes por Lais e Ana (set/2026)
- [ ] Permissões leads.criar / clientes.criar por alcance real (não lista fixa)
- [ ] Botão "Novo lead" no Início passa a exigir leads.criar (aguardando decisão sobre Renata/Bruna)
- [ ] Corte de dados de outra equipe no aviso de duplicidade
- [ ] Provas: contagens iguais para Lais, Ana, Pamela e admin; typecheck/suíte/build

## Esqueci minha senha (set/2026)
- [x] Link + painel de recuperação na tela de login (resposta sempre genérica)
- [x] /definir-senha: bloqueio de conta inativa, limpa senha_reset_exigido, entra no CRM
- [x] Link usado/expirado: mensagem em português + botão "Pedir novo link"
- [x] Sessão de conta desativada encerrada em qualquer origem (ContaInativaError no AuthProvider)
- [x] Limite por e-mail (3/15min) e por IP (10/15min) + auditoria em user_audit_log
- [x] E-mails de autenticação em português com a marca do CRM
- [x] Provas: typecheck, suíte e build com saída real
- [ ] Pendente com o Denis: registros de DNS do remetente próprio (entrega fora do spam)

## Dono do cadastro duplicado (set/2026)
- [x] Mensagem revela dono + equipe, inclusive entre equipes; dados do registro só para quem enxerga
- [x] Consulta de dono por documento (lead, cliente, consulta de CNPJ, busca de clientes)
- [x] Limite de 30 consultas/min por pessoa contado no banco (consulta_tentativas)
- [x] Auditoria só quando revela dono de OUTRA equipe, com documento mascarado
- [x] Documento normalizado (só dígitos) dos dois lados
- [x] Botão "Avisar o dono" (só dentro da equipe) + link direto no chat interno
- [x] Provas: testes em transação com ROLLBACK; typecheck/suíte/build

## Consistência lead x cliente (set/2026)
- [ ] Causa de A (addLead) e B (persistLeadNow sem diagnóstico) corrigidas
- [ ] Documento só com dígitos no banco (gatilho de normalização, compatível com o site antigo)
- [ ] Vínculo automático lead->cliente por documento + recusa de vínculo com CNPJ diferente (só quando ambos preenchidos)
- [ ] Auditoria de toda mudança de cliente_id em lead
- [ ] Correção de dados com backup (39 mascarados, 18 vínculos; 2 donos diferentes na lista do Denis)
- [ ] Seletor de proposta/pedido sem duplicata por documento
- [ ] Provas: testes em ROLLBACK, typecheck, suíte e build
