# Bloco Kelly-1 — Representantes com acesso ao sistema

Representante ativo = usuário normal (papel vendedor, cargo "Representante"), fora do placar/Arena.
Nada dos programas já publicados é alterado.

## Premissas (corrija se estiver errado)

- "Gestora de Representação" hoje existe como **cargo**, não como perfil de acesso.
  A nova permissão será concedida aos perfis **Administrador** e **Gestor Comercial**
  (mecanismo existente: linhas em `perfil_permissoes`). Se você quiser um perfil novo
  chamado "Gestora de Representação", diga e eu crio no mesmo bloco.
- A participação na Arena hoje mora em `arena_participacao.participa_arena`.
  Vou criar `profiles.participa_arena` como pedido e as duas funções do placar passam a
  exigir **as duas** condições (participa na Arena e `profiles.participa_arena = true`),
  preservando todo o resto da lógica.

## 1. Migrations

`profiles`: `participa_arena boolean not null default true`,
`comissao_percent numeric(5,2) null` (CHECK 0–100 quando não nulo), `regiao text null`.

Recriar `placar_vendedores(text)` e `ganhos_fora_do_placar(text)` a partir da definição
atual do banco, mudando **apenas** o CTE de participantes: junta `profiles p` e adiciona
`AND coalesce(p.participa_arena, true) = true`. Mesma assinatura, mesmo retorno, mesma ordem.

Catálogo: inserir em `permissoes` a chave `representantes.gerenciar` no formato das linhas
existentes (ex.: `licitacoes.gerenciar`) e conceder aos perfis Administrador e Gestor Comercial.

Texto exato da permissão nova:
- grupo: `representantes`
- rótulo: `Gerenciar representantes`
- descrição: `Acessa e gerencia o módulo de representantes`
- tipo: `booleana`

## 2. Formulário de usuário (`/usuarios`)

Em `UsuarioEditDialog`, quando o cargo escolhido for "Representante":
- sugere papel vendedor quando ainda não há papel/perfil definido;
- checkbox "Participa do placar/Arena" ligado a `participa_arena` — sugerido **desligado**
  para representante novo, sempre editável por quem tem `usuarios.gerenciar`;
- campos "Comissão (%)" e "Região", visíveis só nesse cargo.

Leitura e gravação passam pela função de servidor existente `updateUsuario`
(novo bloco opcional `representacao` no schema), sem duplicar checagem de permissão.
Alterações entram na auditoria (`user_audit_log`) como os demais campos.

## 3. Tela `/representantes`

Item de menu ao lado de "Equipe" no grupo Empresa, ícone `Handshake`,
visibilidade `key("representantes.gerenciar")` — mesmo padrão de `/licitacoes`.
O gate real é no servidor (RPC `tem_permissao`), como em `licitacoes.functions.ts`;
a tela mostra aviso de sem acesso quando a função de servidor recusa.

Tabela com todo usuário de cargo "Representante" (ativos e inativos, badge de status):
nome, região, comissão %, participa da Arena, carteira (clientes ativos), leads abertos,
propostas do mês corrente, última atividade (maior entre `leads.updated_at` e
`whatsapp_conversas.last_message_at`).

Uma única server function `listRepresentantes` faz todas as contagens em lote
(um select por tabela filtrado por `owner_id/vendedor_id in (ids)`, agregação em memória)
— sem consulta por representante.

`atualizarDadosRepresentante`: gate `representantes.gerenciar` OU `usuarios.gerenciar`,
confere que o alvo tem cargo "Representante" antes de gravar (fail-closed), grava
comissão/região/participa_arena e registra em `user_audit_log`.

Botão "Novo representante" leva para `/usuarios` (a tela só aceita `?busca=` hoje,
então o link vai sem pré-seleção de cargo).

## 4. Testes

Módulo puro `src/lib/representantes.ts` (montagem das linhas a partir dos lotes:
contagens, mês corrente, última atividade) com testes vitest. Suíte completa + `tsgo` no fim.

## Fora deste bloco

Balcão de solicitações, política comercial, ficha de produto, licitações.
