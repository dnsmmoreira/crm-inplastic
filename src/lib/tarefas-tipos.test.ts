import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TAREFA_TIPOS, TAREFA_TIPO_LABEL, rotuloTipoTarefa, sqlCheckTarefasTipo } from "./tarefas-tipos";
import { CADENCIA_PEDIDO } from "./pedidos-cadencia";

/**
 * Tipos que NÃO são de tarefa: são `notificacoes.tipo` (ou payloads de alerta)
 * emitidos pelos mesmos arquivos do Xerife. Ficam listados aqui para que
 * qualquer literal NOVO no código quebre o teste e force uma decisão.
 */
const TIPOS_DE_NOTIFICACAO = new Set([
  "alerta_diretoria",
  "escalacao",
  "esfriando",
  "atribuir_vendedor",
  "reatribuicao",
  "conversa_sem_resposta",
  "conversa_sem_responsavel",
  "handoff_sem_dono",
  "alerta_nao_entregue",
]);

const ARQUIVOS = [
  "src/routes/api/public/hooks/xerife-engine.ts",
  "src/routes/api/public/hooks/xerife-pedidos.ts",
  "src/lib/xerife/watchdog-conversa.server.ts",
  "src/lib/xerife/handoff.server.ts",
  "src/lib/xerife/notify.server.ts",
];

function tiposLiteraisNoArquivo(rel: string): string[] {
  const src = readFileSync(resolve(process.cwd(), rel), "utf8");
  return Array.from(src.matchAll(/tipo:\s*"([a-z0-9_]+)"/g)).map((m) => m[1]!);
}

describe("tipos de tarefa do Xerife", () => {
  it("todo tipo literal usado pelo Xerife é um tipo de tarefa válido ou de notificação", () => {
    const desconhecidos: string[] = [];
    for (const arq of ARQUIVOS) {
      for (const tipo of tiposLiteraisNoArquivo(arq)) {
        const ok = (TAREFA_TIPOS as readonly string[]).includes(tipo) || TIPOS_DE_NOTIFICACAO.has(tipo);
        if (!ok) desconhecidos.push(`${arq}: ${tipo}`);
      }
    }
    expect(desconhecidos).toEqual([]);
  });

  it("todo tipo da cadência de pedidos está na lista canônica", () => {
    for (const cfg of Object.values(CADENCIA_PEDIDO)) {
      expect(TAREFA_TIPOS).toContain(cfg.tipo);
    }
  });

  it("as duas regras que falhavam usam tipos válidos", () => {
    expect(TAREFA_TIPOS).toContain("previsao_atrasada"); // pedido_previsao_atrasada
    expect(TAREFA_TIPOS).toContain("retomar_contato"); // D1_abandono_D2
  });

  it("todo tipo tem rótulo", () => {
    for (const t of TAREFA_TIPOS) {
      expect(TAREFA_TIPO_LABEL[t]).toBeTruthy();
      expect(rotuloTipoTarefa(t)).toBe(TAREFA_TIPO_LABEL[t]);
    }
    expect(rotuloTipoTarefa(null)).toBe("tarefa");
  });

  it("gera o SQL do CHECK com a lista completa", () => {
    const sql = sqlCheckTarefasTipo();
    for (const t of TAREFA_TIPOS) expect(sql).toContain(`'${t}'`);
  });
});
