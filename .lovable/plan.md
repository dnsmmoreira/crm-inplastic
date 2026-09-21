# Xerife Humano — auditoria das ações do Xerife (piloto Maxicaixa)

Nova função de observação: uma pessoa acompanha o trabalho dos vendedores da própria equipe e avalia cada cobrança do Xerife (justa / indevida / deixou passar). Só leitura e avaliação — nenhum poder de cobrar, atender, editar ou configurar.

## 1. Cinco permissões novas (leitura, escopo de equipe)

No mesmo padrão dos `*.ver_equipe` já existentes: `tem_permissao(auth.uid(), <chave>) AND (supervisor_ve_tudo(auth.uid()) OR mesma_equipe(auth.uid(), <dono>))`.

| Chave | Abre |
|---|---|
| `tarefas.ver_equipe` | tarefas cujo `owner_id` é da equipe |
| `interacoes.ver_equipe` | `lead_interactions` de leads cujo dono é da equipe |
| `whatsapp.ver_equipe` | conversas e mensagens da equipe, só leitura |
| `xerife.ver_equipe` | `xerife_log` cujo `vendedor_id` é da equipe |
| `xerife.avaliar` | registrar avaliação (item 3) |

Policies novas e **aditivas**, só de SELECT. Nenhuma policy existente é tocada, nenhum comportamento da INPLASTIC muda (quem não tiver as chaves não enxerga nada a mais).

Detalhe do WhatsApp: a função `whatsapp_conversa_visivel` hoje exige `whatsapp.atender`. Em vez de alterá-la, entram duas policies SELECT separadas (conversas e mensagens) baseadas em `whatsapp.ver_equipe` — leitura pura, sem tocar em UPDATE nem em INSERT.

## 2. Risco de escrita no WhatsApp — tratado explicitamente

Verificação feita no banco antes deste plano:

- `assumir`, `devolver para a IA`, `encerrar`, `transferir`, `espera` e `retomada` já chamam `whatsapp_pode_atuar`, que depende de `whatsapp.atender`. Continuam bloqueados para o auditor mesmo com a conversa visível.
- **O buraco real:** `sendConversaMessage`, `sendConversaAnexo`, `enviarTemplateConversa`, `posseConversa`, `statusJanelaConversa`, `createLeadFromConversa` e `iniciarConversaCliente` se protegem **apenas** pelo fato de a conversa não aparecer no SELECT. Com a leitura liberada, o auditor conseguiria enviar mensagem ao cliente.
- A gravação da mensagem usa acesso administrativo, então a policy de INSERT não segura nada.

Correção: cada uma dessas funções passa a exigir, logo no início, uma checagem explícita — `whatsapp_pode_atuar` (que já embute `whatsapp.atender` + mesma equipe) — antes de qualquer outra lógica. Erro claro: "Você tem acesso somente de leitura a esta conversa."

Provas (testes automatizados): usuário só com `whatsapp.ver_equipe` **lê** a conversa e as mensagens, e recebe erro ao tentar enviar texto, enviar anexo, enviar modelo, assumir, transferir, encerrar e devolver para a IA. Usuário com `whatsapp.atender` da equipe continua fazendo tudo igual (teste de não-regressão).

## 3. Avaliação das ações do Xerife

Duas tabelas novas:

- `xerife_avaliacoes` — uma avaliação por ação do Xerife: `xerife_log_id`, `veredito` (`justa` | `indevida`), `nota` (texto), `avaliador_id`, datas. Única por (log, avaliador).
- `xerife_deixou_passar` — situação que o Xerife deveria ter cobrado e não cobrou: `vendedor_id`, `lead_id` (opcional), `descricao`, `avaliador_id`, datas.

RLS: grava/edita quem tem `xerife.avaliar` **e** o item é da própria equipe (avaliação: equipe do `vendedor_id` do log). Lê o próprio avaliador e os administradores. Sem exclusão para o avaliador. Toda gravação registra linha em `user_audit_log`.

## 4. Tela "Auditoria do Xerife"

Visível para quem tem `xerife.ver_equipe`.

- Lista das ações do Xerife da equipe: vendedor, regra, quando, o que foi cobrado, desfecho da tarefa ligada.
- Filtros por vendedor, regra e período.
- Botões "cobrança justa" / "cobrança indevida" + nota, e botão "registrar deixou passar" — só para quem tem `xerife.avaliar`.
- Para administrador: resumo por regra com contagem de justas, indevidas e deixou passar — base para ajustar o Xerife.

Entrada no menu lateral junto de Xerife/Gestão, condicionada à permissão.

## 5. Cargo e perfis

- Cargo novo: **Analista de Qualidade Comercial**.
- Perfil novo: **Auditor Xerife**, `base_role` vendedor (nunca admin), com `leads/clientes/propostas/pedidos.ver_equipe`, `relatorios.ver`, `tarefas.ver_equipe`, `interacoes.ver_equipe`, `whatsapp.ver_equipe`, `xerife.ver_equipe`, `xerife.avaliar`.
- Perfil **Supervisor ADM** (Lais) ganha `tarefas.ver_equipe`, `interacoes.ver_equipe`, `whatsapp.ver_equipe`. Nada de Xerife.

Nenhum usuário é vinculado automaticamente ao perfil novo — o vínculo é feito na tela de Usuários quando você indicar a pessoa.

## Detalhes técnicos

- Migrações: (a) catálogo `permissoes` + policies SELECT aditivas nas 5 tabelas; (b) tabelas `xerife_avaliacoes` e `xerife_deixou_passar` com GRANT → RLS → policies e trigger de `updated_at`; (c) seed de cargo, perfil `Auditor Xerife` (protegido = false) e as 3 chaves novas no Supervisor ADM.
- Código: constantes em `src/lib/equipes-escopo.ts` (novas chaves ficam **fora** de `PERMS_VER_EQUIPE` para não mudar a detecção de "supervisor de equipe"), guard explícito nas 7 funções de conversa listadas no item 2, `src/lib/xerife-auditoria.functions.ts` (listagem + avaliação + resumo), rota `src/routes/auditoria-xerife.tsx`, item de menu em `__root.tsx`.
- Testes: guard de envio (item 2), regras puras de escopo da auditoria, e verificação em banco das novas policies. Fecho com typecheck, suíte completa e build, com saída real.

## Fora do escopo

Qualquer poder de cobrar, configurar o Xerife, editar ou excluir. Nenhuma mudança de comportamento para a INPLASTIC. Nada publicado.
