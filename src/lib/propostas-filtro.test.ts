import { describe, expect, it } from "vitest";
import { casaFiltroMotivo, OPCOES_FILTRO_MOTIVO } from "./propostas-filtro";

const ps = [
  { id: "a", status: "enviada", motivoRecusa: null, encerramentoAdministrativo: false },
  { id: "b", status: "recusada", motivoRecusa: "Preço", encerramentoAdministrativo: false },
  { id: "c", status: "recusada", motivoRecusa: "Duplicidade", encerramentoAdministrativo: true },
  { id: "d", status: "recusada", motivoRecusa: null, encerramentoAdministrativo: false },
  { id: "e", status: "recusada", motivoRecusa: "Preço", encerramentoAdministrativo: true },
  { id: "f", status: "recusada", motivoRecusa: "Concorrente", encerramentoAdministrativo: false },
];
const ids = (f: Parameters<typeof casaFiltroMotivo>[1]) =>
  ps.filter((p) => casaFiltroMotivo(p, f)).map((p) => p.id);

describe("filtro de motivo em /propostas", () => {
  it("Todos não filtra", () => expect(ids("todos")).toEqual(["a", "b", "c", "d", "e", "f"]));
  it("motivo comercial: só recusadas não-administrativas com aquele motivo", () =>
    expect(ids("Preço")).toEqual(["b"]));
  it("Encerramento administrativo: só as administrativas", () =>
    expect(ids("administrativo")).toEqual(["c", "e"]));
  it("Não informado: recusadas sem motivo", () => expect(ids("nao_informado")).toEqual(["d"]));
  it("opções: todos + 8 comerciais + não informado + administrativo", () =>
    expect(OPCOES_FILTRO_MOTIVO).toHaveLength(11));
});
