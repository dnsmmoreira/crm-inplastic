import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

/**
 * Garante que toda coluna citada nos `.select(...)` de
 * pendencias-cadastro.functions.ts existe de verdade no schema gerado.
 * Foi assim que "pedidos.stage_changed_at" chegou em produção.
 */

type Tables = Database["public"]["Tables"];
type Cols<T extends keyof Tables> = keyof Tables[T]["Row"] & string;

const SELECTS: { [K in keyof Tables & string]?: string[] } = {
  pedidos: [
    "id",
    "number",
    "lead_id",
    "responsavel_atual_id",
    "equipe_responsavel",
    "created_at",
    "updated_at",
    "stage",
    "entrega_comprovada_em",
  ] satisfies Cols<"pedidos">[],
  pedido_stage_history: ["pedido_id", "created_at", "to_stage"] satisfies Cols<"pedido_stage_history">[],
  leads: [
    "id",
    "company",
    "contact_name",
    "stage",
    "owner_id",
    "created_at",
    "etapa_changed_at",
    "cliente_id",
    "cnpj",
    "product",
    "product_id",
    "razao_social",
  ] satisfies Cols<"leads">[],
  produtos: [
    "id",
    "sku",
    "name",
    "weight_kg",
    "height_cm",
    "width_cm",
    "length_cm",
    "created_at",
    "active",
  ] satisfies Cols<"produtos">[],
  clientes: ["id", "razao_social", "cnpj", "vendedor_id", "criado_em", "ativo", "email_nf"] satisfies Cols<"clientes">[],
  propostas: [
    "id",
    "number",
    "lead_id",
    "owner_id",
    "updated_at",
    "discount_percent",
    "acrescimo_percent",
    "status",
  ] satisfies Cols<"propostas">[],
  proposta_itens: ["proposta_id", "quantity", "unit_price"] satisfies Cols<"proposta_itens">[],
  profiles: ["id", "name"] satisfies Cols<"profiles">[],
};

describe("pendencias-cadastro: colunas selecionadas", () => {
  const fonte = readFileSync("src/lib/pendencias-cadastro.functions.ts", "utf8");

  it("não usa pedidos.stage_changed_at", () => {
    expect(/\.select\([^)]*stage_changed_at/.test(fonte)).toBe(false);
  });

  it("deriva a entrada em pós-venda do histórico com to_stage = pos_venda", () => {
    expect(fonte).toContain('.eq("to_stage", "pos_venda")');
  });

  it("cada coluna listada aparece em algum select do arquivo", () => {
    for (const cols of Object.values(SELECTS)) {
      for (const c of cols ?? []) {
        expect(fonte.includes(c)).toBe(true);
      }
    }
  });
});
