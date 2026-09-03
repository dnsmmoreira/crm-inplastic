/**
 * Regressão do incidente 03/09/2026: aba com bundle antigo enviava
 * `omie_codigo_produto` no upsert de `proposta_itens` → 400/42703 → itens
 * nunca gravavam (proposta e parcelas gravavam normal).
 *
 * Este teste trava o payload do upsert nas colunas que a tabela realmente tem.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Colunas reais de `public.proposta_itens` (informadas pelo banco). */
const COLUNAS_TABELA = [
  "id",
  "proposta_id",
  "position",
  "product_id",
  "codigo_produto",
  "description",
  "sku",
  "ncm",
  "unit",
  "quantity",
  "unit_price",
] as const;

const src = readFileSync(resolve(__dirname, "crm-sync.ts"), "utf8");

function blocoUpsertItens(): string {
  const inicio = src.indexOf('supabase.from("proposta_itens").upsert(');
  expect(inicio).toBeGreaterThan(-1);
  const fim = src.indexOf('del: (ids) => supabase.from("proposta_itens")', inicio);
  expect(fim).toBeGreaterThan(inicio);
  return src.slice(inicio, fim);
}

describe("payload de upsert de proposta_itens", () => {
  const bloco = blocoUpsertItens();
  const chaves = Array.from(bloco.matchAll(/^\s{10,}([a-z_]+):/gm)).map((m) => m[1]!);

  it("usa exatamente as colunas existentes hoje na tabela", () => {
    expect([...new Set(chaves)].sort()).toEqual([...COLUNAS_TABELA].sort());
  });

  it("não envia nenhuma coluna legada omie_*", () => {
    expect(bloco).not.toMatch(/omie/i);
    expect(src).not.toMatch(/omie_codigo_produto/i);
  });

  it("o SELECT de itens lê as mesmas colunas", () => {
    for (const c of COLUNAS_TABELA) expect(src).toContain(c);
  });
});
