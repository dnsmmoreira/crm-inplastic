import { describe, expect, it } from "vitest";
import { empresaPreferida, rotuloContato, rotuloLinha } from "./rotulo-contato";

describe("rotuloContato", () => {
  it("usa contato como principal e empresa como secundário", () => {
    expect(rotuloContato({ contato: "Adriana Oliveira", empresa: "MULTIDRY LTDA" })).toEqual({
      principal: "Adriana Oliveira",
      secundario: "MULTIDRY LTDA",
    });
  });

  it("não repete o mesmo texto duas vezes (case-insensitive e trim)", () => {
    expect(rotuloContato({ contato: " Multidry Ltda ", empresa: "MULTIDRY LTDA" })).toEqual({
      principal: "Multidry Ltda",
      secundario: null,
    });
  });

  it("cai para empresa quando não há contato", () => {
    expect(rotuloContato({ contato: "  ", empresa: "ACME", telefone: "5511999" })).toEqual({
      principal: "ACME",
      secundario: null,
    });
  });

  it("cai para telefone quando não há contato nem empresa", () => {
    expect(rotuloContato({ telefone: "5511999999999" })).toEqual({
      principal: "5511999999999",
      secundario: null,
    });
  });

  it("devolve vazio sem nenhum dado", () => {
    expect(rotuloContato({})).toEqual({ principal: "", secundario: null });
  });

  it("mostra empresa ao lado do telefone quando não há contato", () => {
    expect(rotuloContato({ empresa: "ACME", telefone: "551199" }).principal).toBe("ACME");
  });
});

describe("rotuloLinha", () => {
  it("junta contato e empresa com separador", () => {
    expect(rotuloLinha({ contato: "João", empresa: "ACME" })).toBe("João · ACME");
  });
  it("não duplica quando são iguais", () => {
    expect(rotuloLinha({ contato: "ACME", empresa: "acme" })).toBe("ACME");
  });
});

describe("empresaPreferida", () => {
  it("prefere razão social do cliente", () => {
    expect(empresaPreferida({ razao_social: "X LTDA", nome_fantasia: "X" }, "Lead Co")).toBe(
      "X LTDA",
    );
  });
  it("usa fantasia quando não há razão social", () => {
    expect(empresaPreferida({ razao_social: null, nome_fantasia: "X" }, "Lead Co")).toBe("X");
  });
  it("cai para company do lead", () => {
    expect(empresaPreferida(null, "Lead Co")).toBe("Lead Co");
  });
  it("devolve null sem nada", () => {
    expect(empresaPreferida(null, " ")).toBeNull();
  });
});
