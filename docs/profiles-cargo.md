# Cargo das pessoas: `profiles.cargo_id` é a fonte da verdade

## Regra

- **`profiles.cargo_id`** (FK para `cargos.id`) é o **único** lugar onde o cargo
  de uma pessoa deve ser lido e gravado.
- **`profiles.cargo`** (texto) existe apenas por compatibilidade com código
  legado. Ele é **derivado** e **não deve ser escrito** por ninguém.

## Como o gatilho sincroniza

Migração `20260921013020_*.sql`:

- função `public.tg_profiles_cargo_texto()` — `SECURITY DEFINER`,
  `SET search_path = public`;
- gatilho `profiles_cargo_texto` — `BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW`.

Comportamento:

| `NEW.cargo_id`     | `NEW.cargo` gravado          |
| ------------------ | ---------------------------- |
| preenchido         | `cargos.nome` correspondente |
| nulo               | `NULL` (texto é apagado)     |

Como roda `BEFORE`, qualquer tentativa de escrever o texto direto (inclusive por
SQL manual) é sobrescrita. As duas colunas não podem divergir.

## Como atualizar o catálogo com segurança

1. **Criar/renomear/desativar cargo:** pela tela de Cargos
   (`src/components/usuarios/CargosPanel.tsx` → `src/lib/cargos.functions.ts`).
   Ao renomear, o código roda um `update` em `profiles` por `cargo_id`; o gatilho
   reescreve o texto a partir do catálogo de qualquer forma.
2. **Trocar o cargo de uma pessoa:** ficha do usuário, que grava **somente**
   `cargo_id` (`src/lib/usuarios.functions.ts`). O texto vem do gatilho.
3. **Nunca** inclua `cargo:` num `insert`/`update` de `profiles` em código novo.
4. Ao escrever consulta ou relatório novo, junte com `cargos` por `cargo_id`
   em vez de comparar strings.

## Verificações automáticas

| O quê                                       | Onde                                      |
| ------------------------------------------- | ----------------------------------------- |
| Nenhuma leitura direta nova do texto        | `src/lib/cargo-guard.test.ts` + plugin `crm-cargo-guard` em `vite.config.ts` (derruba o build) |
| Contrato do gatilho (código/SQL)            | `src/lib/cargo-sync.test.ts`              |
| Gatilho e dados reais no banco              | `src/lib/cargo-sync.integration.test.ts`  |
| Pipeline                                    | `.github/workflows/ci.yml` (`bun run ci`) |

A varredura mantém uma linha de base por arquivo em
`src/lib/cargo-guard-scan.ts` (`BASE_CONHECIDA`). Arquivo novo ou aumento de
ocorrências quebra o teste **e** o build. Se a leitura for mesmo necessária,
atualize `BASE_CONHECIDA` na mesma alteração, com o motivo no comentário.

O teste de integração exige banco quando `CI=true` (ou
`CARGO_DB_OBRIGATORIO=1`): sem as variáveis `PG*` ou sem conexão, ele **falha**
em vez de ser pulado. Fora de CI, sem banco, os casos são pulados.
