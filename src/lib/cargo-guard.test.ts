/**
 * Guarda automatizada: ninguém pode voltar a LER/ESCREVER o texto
 * `profiles.cargo` sem passar por aqui.
 *
 * A fonte da verdade do cargo de uma pessoa é `profiles.cargo_id` (catálogo
 * `cargos`). O texto `profiles.cargo` só existe por compatibilidade e é
 * derivado pelo trigger `profiles_cargo_texto`.
 *
 * Este teste conta as ocorrências do token `cargo` (sem sufixo, portanto sem
 * `cargo_id`, `cargoTexto`, `decisor_cargo`) por arquivo e compara com a linha
 * de base abaixo. Qualquer arquivo novo, ou qualquer aumento num arquivo
 * conhecido, quebra a suíte.
 *
 * Se o aumento for intencional, atualize BASE_CONHECIDA na mesma alteração e
 * explique o motivo no comentário da linha.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const TOKEN = /(?<![A-Za-z0-9_])cargo(?![A-Za-z0-9_])/g;

/** Arquivos onde `cargo` é de OUTRA tabela ou é gerado — fora do escopo. */
const IGNORADOS = [
  "src/components/contatos/ContatosSection.tsx", // contatos.cargo
  "src/lib/contatos.functions.ts", // contatos.cargo
  "src/routes/contatos.tsx", // contatos.cargo
  "src/integrations/supabase/types.ts", // gerado automaticamente
];

/** Ocorrências legítimas hoje. Aumentou? É leitura nova — revise. */
const BASE_CONHECIDA: Record<string, number> = {
  "src/components/usuarios/CargosPanel.tsx": 5, // catálogo de cargos
  "src/components/usuarios/UsuarioEditDialog.tsx": 13, // ficha do usuário
  "src/lib/cargos.functions.ts": 19, // catálogo + sincronia ao renomear
  "src/lib/representantes.functions.ts": 6, // filtro por "Representante"
  "src/lib/representantes.ts": 3, // comparação do nome do cargo
  "src/lib/usuarios.functions.ts": 9, // validação e auditoria
  "src/routes/representantes.tsx": 1,
  "src/routes/usuarios.tsx": 2,
  "supabase/migrations/20260803010700_6b517d4c-0e9e-42c8-810e-3d98fcb4a942.sql": 1,
  "supabase/migrations/20260824214430_304561c6-9aec-4ca5-a2e8-4aeb54b0430e.sql": 1,
  "supabase/migrations/20260921013020_1eb8f7b0-f297-4318-b488-e27d3795a2a4.sql": 2, // o derivador
};

function arquivos(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, out);
    else if (/\.(ts|tsx|sql)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}

function contagem(): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const raiz of ["src", "supabase"]) {
    for (const p of arquivos(join(RAIZ, raiz))) {
      const rel = relative(RAIZ, p).split(sep).join("/");
      if (IGNORADOS.includes(rel)) continue;
      const n = (readFileSync(p, "utf8").match(TOKEN) ?? []).length;
      if (n > 0) mapa[rel] = n;
    }
  }
  return mapa;
}

describe("guarda de leitura direta de profiles.cargo", () => {
  const atual = contagem();

  it("não surgiu nenhum arquivo novo lendo o texto do cargo", () => {
    const novos = Object.keys(atual).filter((f) => !(f in BASE_CONHECIDA));
    expect(novos, `Use profiles.cargo_id (catálogo cargos) em vez do texto: ${novos.join(", ")}`).toEqual([]);
  });

  it("nenhum arquivo conhecido passou a usar mais o texto do cargo", () => {
    const cresceram = Object.entries(atual)
      .filter(([f, n]) => f in BASE_CONHECIDA && n > BASE_CONHECIDA[f])
      .map(([f, n]) => `${f}: ${BASE_CONHECIDA[f]} -> ${n}`);
    expect(cresceram, "Leitura nova do texto do cargo").toEqual([]);
  });

  it("nenhuma função externa (edge function) lê o texto do cargo", () => {
    const dir = join(RAIZ, "supabase/functions");
    const achados = arquivos(dir).filter((p) => TOKEN.test(readFileSync(p, "utf8")));
    expect(achados).toEqual([]);
  });
});
