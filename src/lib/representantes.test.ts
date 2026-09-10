import { describe, expect, it } from "vitest";
import {
  ehCargoRepresentante,
  inicioDoMes,
  montarRepresentantes,
  type LotesRepresentantes,
  type RepresentanteBase,
} from "@/lib/representantes";

const AGORA = new Date("2026-09-10T12:00:00.000Z");

const base: RepresentanteBase[] = [
  { id: "a", nome: "Kelly", ativo: true, deletedAt: null, participaArena: false, tipoComercial: "representante", comissaoPct: 5, regiao: "Triângulo" },
  { id: "b", nome: "Bruno", ativo: false, deletedAt: null, participaArena: null, tipoComercial: null, comissaoPct: null, regiao: null },
  { id: "c", nome: "Carla", ativo: true, deletedAt: "2026-01-01T00:00:00Z", participaArena: true, tipoComercial: "representante", comissaoPct: 2.5, regiao: null },
];

const lotes: LotesRepresentantes = {
  clientes: [{ vendedor_id: "a" }, { vendedor_id: "a" }, { vendedor_id: "x" }, { vendedor_id: null }],
  leads: [
    { owner_id: "a", stage: "qualificacao", updated_at: "2026-09-08T10:00:00Z" },
    { owner_id: "a", stage: "ganho", updated_at: "2026-09-09T10:00:00Z" },
    { owner_id: "b", stage: "perdido", updated_at: "2026-05-01T10:00:00Z" },
    { owner_id: "z", stage: "novo", updated_at: "2026-09-09T23:00:00Z" },
  ],
  propostas: [
    { owner_id: "a", created_at: "2026-09-02T10:00:00Z" },
    { owner_id: "a", created_at: "2026-08-31T10:00:00Z" },
    { owner_id: "b", created_at: "2026-09-05T10:00:00Z" },
  ],
  conversas: [
    { atribuido_para: "a", last_message_at: "2026-09-09T18:00:00Z" },
    { atribuido_para: "b", last_message_at: null },
  ],
};

describe("ehCargoRepresentante", () => {
  it("aceita variações de caixa e espaço", () => {
    expect(ehCargoRepresentante(" representante ")).toBe(true);
    expect(ehCargoRepresentante("Representante")).toBe(true);
    expect(ehCargoRepresentante("Vendedor")).toBe(false);
    expect(ehCargoRepresentante(null)).toBe(false);
  });
});

describe("inicioDoMes", () => {
  it("volta para o dia 1", () => {
    expect(inicioDoMes(AGORA)).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("montarRepresentantes", () => {
  const linhas = montarRepresentantes(base, lotes, AGORA);
  const byId = Object.fromEntries(linhas.map((l) => [l.id, l]));

  it("conta carteira, leads abertos e propostas do mês, ignorando terceiros", () => {
    expect(byId["a"].carteira).toBe(2);
    expect(byId["a"].leadsAbertos).toBe(1);
    expect(byId["a"].propostasMes).toBe(1);
    expect(byId["b"].leadsAbertos).toBe(0);
    expect(byId["b"].propostasMes).toBe(1);
  });

  it("usa a atividade mais recente entre leads e conversas", () => {
    expect(byId["a"].ultimaAtividade).toBe("2026-09-09T18:00:00Z");
    expect(byId["b"].ultimaAtividade).toBe("2026-05-01T10:00:00Z");
    expect(byId["c"].ultimaAtividade).toBeNull();
  });

  it("trata ausência de linha da Arena como fora do placar", () => {
    expect(byId["b"].participaArena).toBe(false);
    expect(byId["c"].participaArena).toBe(true);
  });

  it("ordena ativos primeiro e excluídos por último", () => {
    expect(linhas.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});
