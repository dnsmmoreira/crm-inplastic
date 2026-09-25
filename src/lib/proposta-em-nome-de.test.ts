import { describe, it, expect } from "vitest";
import { opcoesDonoProposta } from "./propostas-dono";

const perfis = [
  { id: "3", name: "Renata", ativo: true, deleted_at: null },
  { id: "1", name: "Kelly", ativo: true, deleted_at: null },
  { id: "4", name: "Lais", ativo: false, deleted_at: null },
  { id: "5", name: "Antigo", ativo: true, deleted_at: "2026-01-01" },
  { id: "2", name: "Ângelo", ativo: true, deleted_at: null },
];

describe("opcoesDonoProposta", () => {
  it("inativo e excluído ficam de fora", () => {
    const ids = opcoesDonoProposta(perfis, "1").opcoes.map((o) => o.id);
    expect(ids).not.toContain("4");
    expect(ids).not.toContain("5");
  });
  it("ordem alfabética", () => {
    expect(opcoesDonoProposta(perfis, "1").opcoes.map((o) => o.nome)).toEqual([
      "Ângelo",
      "Kelly",
      "Renata",
    ]);
  });
  it("padrão é sempre quem está criando", () => {
    expect(opcoesDonoProposta(perfis, "1").padrao).toBe("1");
    expect(opcoesDonoProposta(perfis, "3").padrao).toBe("3");
  });
});
