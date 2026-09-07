import { describe, it, expect } from "vitest";
import { destinatariosComGestor, gestorDe } from "./gestor";

const perfis = [
  { id: "rep", gestorId: "kelly" },
  { id: "vend", gestorId: null },
  { id: "kelly", gestorId: null },
  { id: "auto", gestorId: "auto" },
];

describe("destinatariosComGestor", () => {
  it("inclui o gestor depois do dono", () => {
    expect(destinatariosComGestor("rep", perfis)).toEqual(["rep", "kelly"]);
  });
  it("devolve só o dono quando não há gestor", () => {
    expect(destinatariosComGestor("vend", perfis)).toEqual(["vend"]);
  });
  it("ignora gestor igual ao dono", () => {
    expect(destinatariosComGestor("auto", perfis)).toEqual(["auto"]);
  });
  it("devolve vazio sem dono", () => {
    expect(destinatariosComGestor(null, perfis)).toEqual([]);
    expect(destinatariosComGestor(undefined, perfis)).toEqual([]);
  });
  it("dono desconhecido continua sendo destinatário", () => {
    expect(destinatariosComGestor("x", perfis)).toEqual(["x"]);
  });
});

describe("gestorDe", () => {
  it("retorna o gestor ou null", () => {
    expect(gestorDe("rep", perfis)).toBe("kelly");
    expect(gestorDe("vend", perfis)).toBeNull();
    expect(gestorDe(null, perfis)).toBeNull();
  });
});
