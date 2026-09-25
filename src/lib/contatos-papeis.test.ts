import { describe, expect, it } from "vitest";
import {
  PAPEIS_CONTATO,
  papelLabel,
  ordenarContatos,
  validarPapelContato,
  type ContatoRow,
} from "./contatos.functions";

const row = (nome: string, papel: string, ativo = true): ContatoRow => ({
  id: nome,
  nome,
  papel,
  cargo: null,
  telefone: null,
  telefone2: null,
  email: null,
  observacao: null,
  lead_id: "l",
  cliente_id: null,
  ativo,
  criado_em: "",
});

describe("papéis de contato", () => {
  it("lista exatamente os 7 valores, nesta ordem", () => {
    expect(PAPEIS_CONTATO.map((p) => p.value)).toEqual([
      "comprador",
      "decisor",
      "influenciador",
      "usuario_final",
      "financeiro",
      "fiscal",
      "outro",
    ]);
  });

  it("rótulos novos", () => {
    expect(papelLabel("fiscal")).toBe("Fiscal");
    expect(papelLabel("usuario_final")).toBe("Usuário final");
  });

  it("nf_xml antigo cai no valor cru", () => {
    expect(papelLabel("nf_xml")).toBe("nf_xml");
  });

  it("papel desconhecido vai por último sem sumir", () => {
    const out = ordenarContatos([
      row("A", "nf_xml"),
      row("B", "outro"),
      row("C", "comprador"),
      row("D", "fiscal"),
    ]);
    expect(out.map((r) => r.nome)).toEqual(["C", "D", "B", "A"]);
  });

  it("cadastro recusa papel fora da lista", () => {
    expect(() => validarPapelContato("nf_xml")).toThrow("Papel inválido");
    expect(() => validarPapelContato("xyz")).toThrow("Papel inválido");
    expect(() => validarPapelContato("fiscal")).not.toThrow();
  });
});
