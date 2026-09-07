import { describe, expect, it } from "vitest";

import { documentosExpirados, calcularExpiracao, categoriaExpira } from "./documentos";

const agora = new Date("2026-09-07T12:00:00.000Z");

function doc(over: Partial<Parameters<typeof documentosExpirados>[0][number]> = {}) {
  return {
    id: "d1",
    categoria: "contrato_social",
    expira_em: "2025-01-01T00:00:00.000Z",
    removido_em: null,
    storage_path: "cliente/1/a.pdf",
    ...over,
  };
}

describe("documentosExpirados", () => {
  it("pega o vencido, não removido e de categoria que expira", () => {
    expect(documentosExpirados([doc()], agora).map((d) => d.id)).toEqual(["d1"]);
  });

  it("ignora expira_em nulo", () => {
    expect(documentosExpirados([doc({ expira_em: null })], agora)).toHaveLength(0);
  });

  it("ignora documento que ainda não venceu", () => {
    expect(
      documentosExpirados([doc({ expira_em: "2027-01-01T00:00:00.000Z" })], agora),
    ).toHaveLength(0);
  });

  it("ignora o que já foi removido", () => {
    expect(
      documentosExpirados([doc({ removido_em: "2026-01-01T00:00:00.000Z" })], agora),
    ).toHaveLength(0);
  });

  it("nunca expurga comprovante de entrega, mesmo com expira_em no passado", () => {
    const provas = ["foto_entrega", "canhoto_nf", "comprovante_entrega"].map((categoria, i) =>
      doc({ id: `p${i}`, categoria }),
    );
    expect(documentosExpirados(provas, agora)).toHaveLength(0);
  });

  it("lista vazia não quebra", () => {
    expect(documentosExpirados([], agora)).toEqual([]);
  });
});

describe("calcularExpiracao por categoria", () => {
  it("comprovantes de entrega não expiram", () => {
    expect(categoriaExpira("canhoto_nf")).toBe(false);
    expect(calcularExpiracao(agora, "canhoto_nf")).toBeNull();
  });
  it("demais categorias mantêm os 12 meses", () => {
    expect(categoriaExpira("contrato_social")).toBe(true);
    expect(calcularExpiracao(agora, "contrato_social")?.toISOString()).toBe(
      "2027-09-07T12:00:00.000Z",
    );
  });
});
