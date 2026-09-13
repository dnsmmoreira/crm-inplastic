/**
 * Regressão: concluir/reabrir tarefa NÃO pode trocar o dono.
 *
 * O dono de uma tarefa muda no servidor (transferência de lead, escalação do
 * Xerife). Se o payload de atualização voltasse a levar `owner_id`, uma aba
 * antiga desfaria a troca — foi o caso da tarefa de "Verapaz Alimentos".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync("src/lib/crm-sync.ts", "utf8");

function corpoDaFuncao(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", i);
  return fonte.slice(i, fim);
}

describe("sincronização de tarefas — dono preservado", () => {
  it("payload de tarefa já existente nunca escreve owner_id", () => {
    expect(corpoDaFuncao("taskToUpdate")).not.toContain("owner_id");
  });

  it("tarefa nova respeita o dono informado antes do dono do lead", () => {
    expect(corpoDaFuncao("taskToInsert")).toContain("owner_id: t.ownerId ?? ownerId");
  });

  it("escolhe o payload pelo snapshot do servidor (existente => update)", () => {
    const corpo = corpoDaFuncao("taskPayload");
    expect(corpo).toContain("snapshot.tasks.has(t.id)");
    expect(corpo).toContain("taskToUpdate(t)");
    expect(corpo).toContain("taskToInsert(t, ownerId)");
  });

  it("o dono é lido do servidor (owner_id está nas colunas de tarefa)", () => {
    const cols = /const COLS_TAREFAS =\s*\n?\s*"([^"]+)"/.exec(fonte)?.[1] ?? "";
    expect(cols.split(",")).toContain("owner_id");
  });

  it("a conclusão/reabertura passa pelo servidor, não por escrita direta de status", () => {
    const hook = readFileSync("src/components/tarefas/useBaixaTarefa.tsx", "utf8");
    expect(hook).toContain("concluirTarefa");
    expect(hook).toContain("reabrirTarefa");
    expect(hook).not.toContain("owner_id");
  });
});
