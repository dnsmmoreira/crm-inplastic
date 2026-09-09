import { describe, expect, it } from "vitest";
import { decidirDevolucao, elegivelParaDevolucao, textoAvisoDevolucao } from "./lead-devolucao";

const AGORA = new Date("2026-09-10T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();
const daquiA = (d: number) => new Date(AGORA.getTime() + d * 86_400_000).toISOString();

describe("aviso antes de devolver o lead", () => {
  it("sem aviso nenhum: avisa primeiro", () => {
    expect(decidirDevolucao(false, false)).toBe("avisar");
  });
  it("aviso com menos de 24h: espera", () => {
    expect(decidirDevolucao(true, true)).toBe("esperar");
  });
  it("aviso com 24h ou mais: devolve", () => {
    expect(decidirDevolucao(true, false)).toBe("devolver");
  });
  it("texto usa o nome da empresa", () => {
    expect(textoAvisoDevolucao("ACME")).toContain("ACME");
    expect(textoAvisoDevolucao(null)).toContain("sem nome");
  });
});

describe("elegibilidade para devolução à fila", () => {
  it("lead sem proposta e sem retorno agendado é elegível", () => {
    expect(elegivelParaDevolucao({ stage: "qualificacao" }, 0, AGORA)).toBe(true);
  });
  it("proposta enviada nos últimos 15 dias protege o lead", () => {
    expect(
      elegivelParaDevolucao({ stage: "proposta", proposta_enviada_at: diasAtras(5) }, 0, AGORA),
    ).toBe(false);
  });
  it("proposta antiga não protege sozinha", () => {
    expect(
      elegivelParaDevolucao({ stage: "qualificacao", proposta_enviada_at: diasAtras(40) }, 0, AGORA),
    ).toBe(true);
  });
  it("proposta aberta em negociação protege mesmo com envio antigo", () => {
    expect(
      elegivelParaDevolucao({ stage: "negociacao", proposta_enviada_at: diasAtras(40) }, 1, AGORA),
    ).toBe(false);
  });
  it("retorno agendado no futuro protege", () => {
    expect(elegivelParaDevolucao({ stage: "novo", next_followup: daquiA(3) }, 0, AGORA)).toBe(false);
  });
  it("retorno agendado no passado não protege", () => {
    expect(elegivelParaDevolucao({ stage: "novo", next_followup: diasAtras(3) }, 0, AGORA)).toBe(
      true,
    );
  });
});
