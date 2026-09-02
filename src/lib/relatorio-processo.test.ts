import { describe, it, expect } from "vitest";
import {
  media,
  mediana,
  resumoDuracao,
  horasEntre,
  propostaParada,
  leadSemPrimeiroContato,
} from "./relatorio-processo";

describe("mediana/média", () => {
  it("lista vazia devolve null e zero casos", () => {
    expect(mediana([])).toBeNull();
    expect(media([])).toBeNull();
    expect(resumoDuracao([])).toEqual({ mediana: null, media: null, casos: 0 });
  });
  it("um elemento devolve o próprio valor", () => {
    expect(resumoDuracao([7])).toEqual({ mediana: 7, media: 7, casos: 1 });
  });
  it("par e ímpar", () => {
    expect(mediana([1, 3, 2])).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(media([1, 2, 3, 10])).toBe(4);
  });
});

describe("horasEntre", () => {
  it("ignora faltantes e ordem invertida", () => {
    expect(horasEntre(null, "2026-01-01T00:00:00Z")).toBeNull();
    expect(horasEntre("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBeNull();
    expect(horasEntre("2026-01-01T00:00:00Z", "2026-01-01T06:00:00Z")).toBe(6);
  });
});

describe("propostaParada", () => {
  const agora = new Date("2026-02-01T00:00:00Z");
  it("enviada há mais de 15 dias sem pedido é parada", () => {
    expect(
      propostaParada({ status: "enviada", sent_at: "2026-01-01T00:00:00Z", temPedido: false }, agora),
    ).toBe(true);
  });
  it("com pedido, recente, ou de outro status não é parada", () => {
    expect(
      propostaParada({ status: "enviada", sent_at: "2026-01-01T00:00:00Z", temPedido: true }, agora),
    ).toBe(false);
    expect(
      propostaParada({ status: "enviada", sent_at: "2026-01-25T00:00:00Z", temPedido: false }, agora),
    ).toBe(false);
    expect(
      propostaParada({ status: "recusada", sent_at: "2026-01-01T00:00:00Z", temPedido: false }, agora),
    ).toBe(false);
    expect(propostaParada({ status: "enviada", sent_at: null, temPedido: false }, agora)).toBe(false);
  });
});

describe("leadSemPrimeiroContato", () => {
  const agora = new Date("2026-02-01T00:00:00Z");
  const base = {
    stage: "novo",
    created_at: "2026-01-28T00:00:00Z",
    last_contact_at: null,
    last_interaction_at: null,
  };
  it("lead aberto e sem contato há mais de 24h entra", () => {
    expect(leadSemPrimeiroContato(base, agora)).toBe(true);
  });
  it("contato registrado, saída de WhatsApp, fechado ou recente ficam de fora", () => {
    expect(leadSemPrimeiroContato({ ...base, last_contact_at: "2026-01-29T00:00:00Z" }, agora)).toBe(false);
    expect(leadSemPrimeiroContato({ ...base, last_interaction_at: "2026-01-29T00:00:00Z" }, agora)).toBe(false);
    expect(leadSemPrimeiroContato({ ...base, temSaida: true }, agora)).toBe(false);
    expect(leadSemPrimeiroContato({ ...base, stage: "ganho" }, agora)).toBe(false);
    expect(leadSemPrimeiroContato({ ...base, created_at: "2026-01-31T20:00:00Z" }, agora)).toBe(false);
  });
});
