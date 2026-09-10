# Etapa do lead volta sozinha — correção

## a) Gatilho confirmado

Consultei o histórico dos três leads no banco. Todas as mudanças de etapa chegaram
como gravação genérica de lead (`POST /leads` e `PATCH /leads`), nenhuma por caminho
dedicado. No caso do Ricardo, a volta ganho→proposta (04/09 19:45) veio de uma
gravação genérica — é exatamente o mesmo padrão do bug de dono de tarefa: a aba com
cópia antiga do lead reenviou a etapa velha por cima da etapa certa do servidor.

Confirmações extras:
- Não existe hoje nenhum lugar na tela que grave o "reagendar para" (`next_followup`)
  do lead. Por isso o campo do PR Comércio está vazio: o reagendamento nunca teve
  onde ser feito. O motor do Xerife já respeita esse campo.
- "Concluir" no card da tarefa fecha só a tarefa; não encerra o lead. Isso explica
  CSI e PR Comércio sem registro de fechamento.
- A tela "Minha Agenda" filtra pelas tarefas do próprio usuário. Não há como a
  tarefa da Beatriz aparecer para a Pamela por essa tela — vale pedir print.

## b) O que será feito

1. **Etapa deixa de ir no salvamento genérico.** Em `src/lib/crm-sync.ts`, o payload
   de lead já existente passa a excluir `stage` e `next_followup` (hoje só exclui o
   responsável). Nenhuma aba antiga consegue mais reverter fechamento nem apagar
   reagendamento. Lead novo continua nascendo com a etapa inicial.

2. **Mudança de etapa por caminho dedicado.** Nova função de servidor
   `moverEtapaLead` (`src/lib/leads-etapa.functions.ts`), no mesmo padrão da
   transferência de dono: valida dono/admin, grava a etapa, registra origem
   "tela" no histórico e devolve erro claro. `useMoveLeadStage` passa a chamar
   essa função para toda etapa (hoje só "ganho" tem caminho de servidor); o
   estado local só muda depois do servidor confirmar. Ganho continua passando
   antes pelo gate fiscal existente, e perdido continua gravando motivo
   estruturado.

3. **Reagendar (silenciar cobrança) vira ação real.** Mesma família:
   `reagendarLead` grava `next_followup` (e `recontatar_em` quando for lead
   perdido). Botão "Reagendar cobrança" na ficha do lead, com seletor de data e
   confirmação; a ficha mostra "Xerife silenciado até dd/mm".

4. **Etapa/reagendamento só mudam por ação explícita.** Varredura para garantir
   que nenhuma outra tela grave esses campos direto.

5. **Regra de banco de segurança (aviso obrigatório, vou te chamar antes de
   aplicar):** para blindar de vez, avalio uma trava no banco que impeça um
   lead sair de ganho/perdido por gravação genérica. Isso mexe em regra de
   banco, então só aplico com seu ok — a correção dos itens 1 a 3 já resolve o
   caso relatado sem isso.

## c) Ponto de UX — "esfriando"

Esse marcador é ligado pelo próprio Xerife a cada rodada, nunca pelo vendedor.
Hoje ele aparece só no painel de cadência (gestão), com o rótulo "Leads
esfriando". Vou trocar para "Esfriando (alerta automático do Xerife)" e
acrescentar a explicação de que a única forma de pausar a cobrança é fechar o
lead ou reagendar — que passa a existir no item 3.

## d) Validação antes de publicar

- Caso do Ricardo simulado: aba com cópia antiga salvando depois do fechamento
  não altera mais a etapa.
- Marcar perdido pela tela grava histórico e fecha as tarefas do Xerife.
- Reagendar para outubro persiste e o Xerife não cobra até lá.
- Suíte completa e verificações automáticas.

Te chamo com o resumo do diff antes de qualquer publicação.
