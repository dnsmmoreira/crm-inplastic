import { describe, expect, it } from "vitest";
import { perdaSchema } from "./leads-perda.functions";
import { MOTIVOS_PERDA, MOTIVOS_RECUSA_PROPOSTA, detalheValido, recontatoDias } from "./motivos-perda";

const base = { leadId: "lead-1", observacao: "cliente fechou com concorrente" };

describe("motivos de perda", () => {
  it("não existe mais o motivo 'Outro'", () => {
    expect(MOTIVOS_PERDA).not.toContain("Outro" as never);
    expect(() => perdaSchema.parse({ ...base, motivo: "Outro" })).toThrow();
  });

  it("aceita motivos da lista canônica", () => {
    for (const m of MOTIVOS_PERDA) {
      expect(perdaSchema.parse({ ...base, motivo: m }).motivo).toBe(m);
    }
  });

  it("recusa detalhe curto ou vazio", () => {
    expect(() => perdaSchema.parse({ ...base, motivo: "Preço", observacao: "curto" })).toThrow();
    expect(() => perdaSchema.parse({ ...base, motivo: "Preço", observacao: "   " })).toThrow();
    expect(detalheValido("curto")).toBe(false);
    expect(detalheValido("descrição suficiente")).toBe(true);
  });

  it("recontato: null para Duplicidade e Lead inválido, 180 para demanda adiada, 90 no resto", () => {
    expect(recontatoDias("Duplicidade")).toBeNull();
    expect(recontatoDias("Lead inválido")).toBeNull();
    expect(recontatoDias("Demanda cancelada ou adiada")).toBe(180);
    expect(recontatoDias("Preço")).toBe(90);
  });

  it("recusa de proposta: 8 motivos, sem Duplicidade e sem Lead inválido; lead segue com 10", () => {
    expect(MOTIVOS_RECUSA_PROPOSTA).toHaveLength(8);
    expect(MOTIVOS_RECUSA_PROPOSTA).not.toContain("Duplicidade" as never);
    expect(MOTIVOS_RECUSA_PROPOSTA).not.toContain("Lead inválido" as never);
    expect(MOTIVOS_PERDA).toHaveLength(10);
    expect(MOTIVOS_PERDA).toContain("Duplicidade");
    expect(MOTIVOS_PERDA).toContain("Lead inválido");
  });
});
