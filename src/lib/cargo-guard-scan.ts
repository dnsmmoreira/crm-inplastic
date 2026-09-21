/**
 * Varredura de leituras diretas do texto `profiles.cargo`.
 *
 * A fonte da verdade do cargo de uma pessoa é `profiles.cargo_id` (catálogo
 * `cargos`). O texto `profiles.cargo` existe só por compatibilidade e é
 * derivado pelo gatilho `profiles_cargo_texto`.
 *
 * Este módulo é usado em dois lugares:
 *  - pelo teste `src/lib/cargo-guard.test.ts` (suíte e CI);
 *  - pelo plugin de build em `vite.config.ts`, que derruba o build quando
 *    aparece leitura nova.
 *
 * Ver `docs/profiles-cargo.md`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Token `cargo` isolado — não casa com `cargo_id`, `cargoTexto`, `decisor_cargo`. */
const TOKEN = /(?<![A-Za-z0-9_])cargo(?![A-Za-z0-9_])/g;

/** Arquivos onde `cargo` é de OUTRA tabela ou é gerado — fora do escopo. */
export const IGNORADOS = [
  "src/lib/cargo-guard-scan.ts", // este próprio arquivo (documenta a regra)
  "src/components/contatos/ContatosSection.tsx", // contatos.cargo
  "src/lib/contatos.functions.ts", // contatos.cargo
  "src/routes/contatos.tsx", // contatos.cargo
  "src/integrations/supabase/types.ts", // gerado automaticamente
];

/** Ocorrências legítimas hoje. Aumentou? É leitura nova — revise. */
export const BASE_CONHECIDA: Record<string, number> = {
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

export function arquivosDe(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosDe(p, out);
    else if (/\.(ts|tsx|sql)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}

function contar(texto: string): number {
  return (texto.match(TOKEN) ?? []).length;
}

/** Contagem atual por arquivo (caminhos relativos à raiz do projeto). */
export function contarOcorrencias(raiz = process.cwd()): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const sub of ["src", "supabase"]) {
    for (const p of arquivosDe(join(raiz, sub))) {
      const rel = relative(raiz, p).split(sep).join("/");
      if (IGNORADOS.includes(rel)) continue;
      const n = contar(readFileSync(p, "utf8"));
      if (n > 0) mapa[rel] = n;
    }
  }
  return mapa;
}

export type Violacoes = {
  novos: string[];
  cresceram: string[];
  edgeFunctions: string[];
};

export function verificarCargoGuard(raiz = process.cwd()): Violacoes {
  const atual = contarOcorrencias(raiz);
  const novos = Object.keys(atual)
    .filter((f) => !(f in BASE_CONHECIDA))
    .sort();
  const cresceram = Object.entries(atual)
    .filter(([f, n]) => f in BASE_CONHECIDA && n > BASE_CONHECIDA[f])
    .map(([f, n]) => `${f}: ${BASE_CONHECIDA[f]} -> ${n}`)
    .sort();
  const edgeFunctions = arquivosDe(join(raiz, "supabase/functions"))
    .filter((p) => contar(readFileSync(p, "utf8")) > 0)
    .map((p) => relative(raiz, p).split(sep).join("/"));
  return { novos, cresceram, edgeFunctions };
}

export function mensagemDeFalha(v: Violacoes): string | null {
  const partes: string[] = [];
  if (v.novos.length) partes.push(`arquivos novos lendo o texto do cargo: ${v.novos.join(", ")}`);
  if (v.cresceram.length) partes.push(`leituras novas em: ${v.cresceram.join("; ")}`);
  if (v.edgeFunctions.length)
    partes.push(`funções externas lendo o texto do cargo: ${v.edgeFunctions.join(", ")}`);
  if (!partes.length) return null;
  return (
    `Leitura direta de profiles.cargo detectada — ${partes.join(" | ")}. ` +
    `Use profiles.cargo_id (catálogo cargos). Se for intencional, atualize BASE_CONHECIDA ` +
    `em src/lib/cargo-guard-scan.ts. Ver docs/profiles-cargo.md.`
  );
}
