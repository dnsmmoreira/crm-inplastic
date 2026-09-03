/**
 * Regressão da renomeação `omie_codigo_produto` → `codigo_produto`.
 * A coluna é viva (código do produto usado na seleção de itens da proposta):
 * o mapeamento de leitura e de escrita precisa continuar existindo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sync = readFileSync(resolve(__dirname, "crm-sync.ts"), "utf8");
const store = readFileSync(resolve(__dirname, "crm-store.ts"), "utf8");

describe("codigo_produto no item de proposta", () => {
  it("crm-sync lê a coluna nova no SELECT de proposta_itens", () => {
    expect(sync).toContain("codigo_produto,description");
  });

  it("crm-sync grava codigo_produto no upsert dos itens", () => {
    expect(sync).toContain("codigo_produto: x.item.codigoProduto ?? null");
  });

  it("crm-sync mapeia a coluna para o campo do store", () => {
    expect(sync).toContain("codigoProduto:");
  });

  it("o store expõe o campo renomeado no ProposalItem", () => {
    expect(store).toMatch(/codigoProduto\?: number/);
  });

  it("nenhum resquício de Omie nos dois arquivos", () => {
    expect(sync.toLowerCase()).not.toContain("omie");
    expect(store.toLowerCase()).not.toContain("omie");
  });
});
