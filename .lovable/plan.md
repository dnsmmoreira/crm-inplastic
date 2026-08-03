# Configuração completa de usuários em /usuarios

Transforma a página de usuários numa central de administração da equipe: listagem com busca/filtros/ordenação e ações rápidas, mais um modal de edição com 5 abas por usuário. Só administradores acessam, e a regra é validada também no servidor — não apenas escondendo botões na tela.

## Decisões já definidas

- Permissões granulares: gravadas e aplicadas nos pontos principais (relatórios, exportação, gestão de usuários, integrações). Regras de leads/propostas continuam como estão hoje.
- Entrega em um único bloco.
- Avatar continua sendo iniciais + cor (sem upload de arquivo por enquanto).

## Migrações de banco necessárias

**1. Novas colunas em `profiles`**
- `email_cache` (text) — espelho do e-mail para busca/ordenação na lista; a fonte da verdade continua sendo o cadastro de acesso.
- `cargo` (text)
- `fuso_horario` (text, padrão `America/Sao_Paulo`)
- `ativo` (boolean, padrão true) — desativar bloqueia o login sem apagar histórico.
- `limite_leads_simultaneos` (int, nulo = sem limite)
- `canais_entrada` (text[], padrão `{}` = todos permitidos)
- `deleted_at` (timestamptz) — soft delete.
- `deleted_by` (uuid)
- `ultimo_acesso_em` (timestamptz)
- `senha_reset_exigido` (boolean, padrão false) — marca o fluxo de /primeiro-acesso.

**2. Nova tabela `user_permissions`** (uma linha por usuário)
- `user_id` (PK, referência ao usuário), e flags booleanas: `ver_todos_leads`, `editar_propostas`, `excluir_propostas`, `exportar_dados`, `ver_relatorios`, `gerenciar_usuarios`, `configurar_integracoes`.
- Grants para `authenticated` e `service_role`; RLS: cada um lê as próprias; admin lê e grava todas (via `has_role`).

**3. Nova tabela `user_audit_log`** (imutável)
- `id`, `alvo_user_id`, `ator_user_id`, `campo`, `valor_anterior`, `valor_novo`, `criado_em`.
- Grants: leitura para `authenticated` (admin, via política), escrita só por `service_role`. Sem update nem delete.

**4. Função `public.admins_ativos_count()`** (`SECURITY DEFINER`)
- Conta administradores ativos e não excluídos. Usada para impedir a remoção do último admin.

**5. Ajuste de RLS em `profiles`**
- Manter a política atual de leitura; adicionar política para o admin atualizar qualquer perfil e restringir os campos administrativos (`ativo`, `deleted_at`, permissões) a quem tem papel admin.

**6. Backfill sem destruir dados**
- Criar uma linha em `user_permissions` para cada usuário existente com os padrões (vendedor: só os próprios leads, sem exportar, sem gerenciar usuários; admin: tudo ligado). Nenhuma linha existente de `profiles`, `leads` ou `propostas` é alterada além das colunas novas com valor padrão.

## Backend (server functions em `src/lib/usuarios.functions.ts`)

Todas com `requireSupabaseAuth` + verificação de papel admin no servidor (mesmo padrão do `assertAdmin` já usado em `fila.functions.ts`):

- `listUsuarios` — junta perfil, papel, permissões, presença na fila, meta mensal, último acesso.
- `updateUsuario` — dados cadastrais + acesso + vendas + permissões numa transação lógica; grava cada campo alterado no log de auditoria.
- `checkEmailDuplicado` — validação de duplicidade contra a base de acesso.
- `setUsuarioAtivo` — ativa/desativa; recusa se for o próprio usuário ou se deixaria a base sem admin ativo.
- `setUsuarioRole` — reaproveita a lógica atual de papéis; recusa o admin rebaixar a si mesmo e recusa remover o último admin.
- `forcarRedefinicaoSenha` — marca o usuário para o fluxo `/primeiro-acesso` e limpa a senha atual.
- `encerrarSessoes` — invalida as sessões ativas do usuário.
- `softDeleteUsuario` / `hardDeleteUsuario` — a definitiva exige o nome digitado igual e a indicação de outro vendedor para receber leads e propostas; a reatribuição ocorre antes da exclusão.
- `listAuditoriaUsuario` — histórico de alterações.

Bloqueio de login: o gate de sessão passa a recusar perfis com `ativo = false` ou `deleted_at` preenchido, com mensagem clara e signOut.

## Frontend

- `src/routes/usuarios.tsx`: barra de busca (nome/e-mail), filtros por papel e status, ordenação por nome/cadastro/último acesso, e por item da lista um botão **Editar** mais ações rápidas (ativar/desativar, redefinir senha, remover da fila).
- Novo `src/components/usuarios/UsuarioEditDialog.tsx` usando `Dialog` + `Tabs` do design system atual, com as abas:
  1. **Dados cadastrais** — nome, e-mail (validação + duplicidade), telefone/WhatsApp, cargo, avatar (cor/iniciais), fuso horário.
  2. **Acesso e segurança** — papel, status ativo/inativo, forçar redefinição de senha, encerrar sessões.
  3. **Vendas** — meta mensal (grava em `vendedor_metas`), participação e posição na fila (reaproveita `fila.functions.ts`, sem duplicar lógica), limite de leads simultâneos, canais de entrada permitidos.
  4. **Permissões** — os sete interruptores; travados para o próprio usuário no caso de "gerenciar usuários".
  5. **Auditoria** — data de cadastro, último acesso e log de alterações.
- Novo `src/components/usuarios/ExcluirUsuarioDialog.tsx` — soft delete como padrão; exclusão definitiva exige digitar o nome e escolher o vendedor que recebe leads e propostas.
- O card da fila round-robin e o cadastro de novo usuário permanecem funcionando como hoje; o modal apenas reutiliza as mesmas funções.

## Aplicação das permissões nesta etapa

- Menu e rotas de Relatórios, Usuários e Canais/Integrações passam a respeitar as flags.
- Exportação de relatórios verificada também no servidor.
- Leads e propostas mantêm a regra de dono atual; `ver_todos_leads` fica gravado e pronto para a próxima etapa.

## Garantias

- Nenhum dado transacional é apagado: exclusão padrão é lógica.
- Sempre pelo menos um admin ativo; o admin não consegue rebaixar nem desativar a si mesmo.
- Toda regra crítica é checada no servidor e por política de acesso do banco, não só na interface.
