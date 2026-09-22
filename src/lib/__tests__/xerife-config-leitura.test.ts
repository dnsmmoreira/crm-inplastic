import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de segurança: só a tela de admin do Xerife (e o MCP, que tenta a
 * tabela e cai na função operacional) pode ler `xerife_config` direto com o
 * token do usuário. Todo o resto usa `xerife_config_operacional()`, que não
 * devolve os pesos do placar.
 *
 * Arquivos que rodam com service role (crons, hooks e *.server.ts do motor)
 * não passam pela policy, por isso ficam liberados na lista abaixo.
 */
const LIBERADOS = new Set<string>([
  // tela de admin (get/update da configuração; update exige admin no banco)
  "src/lib/xerife.functions.ts",
  // define o template automático (UPDATE, não SELECT) — feito por admin
  "src/lib/frases-prontas.functions.ts",
  // ferramenta MCP: tenta a tabela (admin) e cai na função operacional
  "src/lib/mcp/tools/xerife_config_view.ts",
  // helper que encapsula a função operacional
  "src/lib/xerife-config-operacional.ts",
  // motor/crons: rodam com service role, fora da policy
  "src/lib/xerife/watchdog-conversa.server.ts",
  "src/lib/xerife/notify.server.ts",
  "src/lib/whatsapp-send.server.ts",
  "src/routes/api/public/hooks/xerife.ts",
  "src/routes/api/public/hooks/xerife-engine.ts",
  "src/routes/api/public/hooks/xerife-pedidos.ts",
  "src/routes/api/public/hooks/xerife-agenda-diaria.ts",
  // tipos gerados
  "src/integrations/supabase/types.ts",
]);

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "__tests__" || nome === "node_modules") continue;
      arquivos(p, acc);
    } else if (/\.(ts|tsx)$/.test(nome)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("leitura de xerife_config", () => {
  it("fora da tela de admin ninguém lê a tabela direto", () => {
    const infratores: string[] = [];
    for (const arquivo of arquivos("src")) {
      const rel = arquivo.replace(/\\/g, "/");
      if (LIBERADOS.has(rel)) continue;
      const conteudo = readFileSync(arquivo, "utf8");
      if (/from\(\s*["']xerife_config["']\s*\)/.test(conteudo)) infratores.push(rel);
    }
    expect(infratores).toEqual([]);
  });

  it("os pesos do placar nunca aparecem na função operacional", () => {
    const bruto = readFileSync("src/lib/xerife-config-operacional.ts", "utf8");
    // ignora comentários: interessa o que o código expõe
    const helper = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(helper).not.toMatch(/placar_peso_/);
    expect(helper).not.toMatch(/placar_dias_sem_proposta_limite/);
  });
});
