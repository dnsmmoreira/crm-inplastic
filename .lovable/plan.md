## Objetivo

Transformar o CRM (hoje em `localStorage` com "trocador de usuário" fake) em um sistema multiusuário real com login, onde:

- Cada vendedor entra com **e-mail e senha próprios**
- Cada vendedor vê **somente seus** leads, propostas, tarefas e pedidos
- **Admin** vê tudo e é o único que edita produtos, condições comerciais, empresas do grupo e cadastros de usuários

---

## Passo 1 — Ativar Lovable Cloud

Habilita banco de dados PostgreSQL, autenticação (e-mail/senha + Google opcional) e storage. Sem isso não há como ter login real nem dados compartilhados de forma segura.

## Passo 2 — Modelagem do banco (tabelas + RLS)

Criar as tabelas correspondentes ao `crm-store` de hoje, todas com uma coluna `owner_id uuid` (dono do registro) e Row-Level Security ativa:

- `profiles` (id, nome, avatar_color) — criado automaticamente no signup via trigger
- `user_roles` (user_id, role) — tabela separada com enum `app_role` (`admin`, `vendedor`), acessada via função `has_role()` security definer (padrão seguro, evita escalada de privilégio)
- `leads`, `contatos`, `tarefas`, `propostas`, `proposta_itens`, `pedidos` — cada uma com `owner_id`
- `produtos`, `condicoes_comerciais`, `emitters` (empresas do grupo) — cadastros globais, só admin edita

**Regras de acesso (RLS):**

| Tabela | Vendedor | Admin |
|---|---|---|
| leads / contatos / tarefas / propostas / pedidos | vê/edita só onde `owner_id = auth.uid()` | vê e edita tudo |
| produtos / condições / empresas | só leitura | leitura + escrita |
| user_roles / profiles | vê o próprio | gerencia todos |

Toda tabela terá `GRANT` explícito para `authenticated` + `service_role`.

## Passo 3 — Telas de autenticação

- Rota pública `/auth` com abas **Entrar** e **Cadastrar** (e-mail/senha)
- Rota `/reset-password` para redefinição
- Layout `_authenticated/` gerenciado que protege o restante do app
- Ao entrar, se ainda não tiver papel, recebe `vendedor` por padrão (trigger). O primeiro usuário criado (ou um convidado manualmente) vira `admin`

## Passo 4 — Tela admin de usuários (`/usuarios`)

Só admin acessa. Permite:
- Listar vendedores cadastrados
- Convidar novos por e-mail
- Promover/rebaixar entre `admin` e `vendedor`
- Desativar acesso

## Passo 5 — Migrar o `crm-store` para o banco

Substituir o Zustand + localStorage por consultas via `createServerFn` autenticadas:
- Todas as leituras/gravações passam a usar a sessão do usuário logado (RLS aplica automaticamente o filtro por `owner_id`)
- Sumir com o `UserSwitcher` da barra lateral (agora mostra o usuário real logado + botão sair)
- `useIsAdmin()` passa a consultar a tabela `user_roles` via função `has_role`
- Gates de UI existentes (menus admin-only) continuam funcionando, mas a segurança de verdade fica no banco

## Passo 6 — Publicar

Depois que login + isolamento por vendedor estiverem funcionando, publicamos. Você entra como primeiro admin, promove sua equipe e compartilha o link — cada um cria/entra com a própria conta.

---

## Observações técnicas importantes

- **Dados atuais do localStorage não migram automaticamente.** Se tiver leads/propostas cadastrados hoje que precisa preservar, me avise antes que eu adiciono uma tela de importação; caso contrário começamos do zero (recomendado, já que hoje é ambiente de teste).
- Login social (Google) posso adicionar junto ou depois — me diga se quer já no primeiro deploy.
- Escopo é grande, então vou entregar em duas etapas dentro deste plano: **(A)** Cloud + auth + tela `/auth` + tabelas + RLS + tela de usuários; **(B)** migração completa do store e remoção do `localStorage`. Publicamos entre as duas se quiser validar o login antes.

Confirmar para eu começar pela etapa A?
