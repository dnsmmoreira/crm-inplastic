import { describe, it, expect } from "vitest";
import {
  mesmaEquipe,
  normalizarSupervisorEscopo,
  perfilEhSupervisorEquipe,
  visivelPorEquipe,
} from "./equipes-escopo";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("mesmaEquipe", () => {
  it("casa apenas equipes iguais e não nulas", () => {
    expect(mesmaEquipe(A, A)).toBe(true);
    expect(mesmaEquipe(A, B)).toBe(false);
  });
  it("null nunca casa — nem com null", () => {
    expect(mesmaEquipe(null, null)).toBe(false);
    expect(mesmaEquipe(A, null)).toBe(false);
    expect(mesmaEquipe(null, A)).toBe(false);
  });
});

describe("perfilEhSupervisorEquipe", () => {
  it("detecta pela chave, não pelo nome", () => {
    expect(perfilEhSupervisorEquipe(["pedidos.ver_equipe"])).toBe(true);
    expect(perfilEhSupervisorEquipe(["leads.ver_equipe", "clientes.ver_equipe"])).toBe(true);
  });
  it("perfis existentes (ver_todos) não são supervisores de equipe", () => {
    expect(perfilEhSupervisorEquipe(["pedidos.ver_todos", "propostas.ver_todas"])).toBe(false);
    expect(perfilEhSupervisorEquipe([])).toBe(false);
    expect(perfilEhSupervisorEquipe(null)).toBe(false);
  });
});

describe("visivelPorEquipe", () => {
  const base = { temPermissaoVerEquipe: true, escopo: "equipe" as const, equipeAtor: A };

  it("sem a permissão nova, nada muda", () => {
    expect(
      visivelPorEquipe({ ...base, temPermissaoVerEquipe: false, equipeDono: A }),
    ).toBe(false);
  });
  it("escopo equipe vê só a própria equipe", () => {
    expect(visivelPorEquipe({ ...base, equipeDono: A })).toBe(true);
    expect(visivelPorEquipe({ ...base, equipeDono: B })).toBe(false);
  });
  it("registro sem dono/equipe não aparece", () => {
    expect(visivelPorEquipe({ ...base, equipeDono: null })).toBe(false);
    expect(visivelPorEquipe({ ...base, equipeAtor: null, equipeDono: null })).toBe(false);
  });
  it("escopo global vê tudo", () => {
    expect(visivelPorEquipe({ ...base, escopo: "global", equipeDono: B })).toBe(true);
    expect(visivelPorEquipe({ ...base, escopo: "global", equipeDono: null })).toBe(true);
  });
});

describe("normalizarSupervisorEscopo", () => {
  it("cai em 'equipe' por padrão", () => {
    expect(normalizarSupervisorEscopo("global")).toBe("global");
    expect(normalizarSupervisorEscopo("equipe")).toBe("equipe");
    expect(normalizarSupervisorEscopo(null)).toBe("equipe");
    expect(normalizarSupervisorEscopo("qualquer")).toBe("equipe");
  });
});
