import { describe, it, expect, vi } from "vitest";
import { tratativaValida, MSG_TRATATIVA_OBRIGATORIA } from "./tratativa-comercial";

describe("tratativaValida", () => {
  it("recusa vazio, espaços e texto curto", () => {
    expect(tratativaValida(null)).toBe(false);
    expect(tratativaValida("   ")).toBe(false);
    expect(tratativaValida("curto demais")).toBe(false);
  });
  it("aceita texto com 20+ caracteres", () => {
    expect(tratativaValida("Cliente aceitou 30/60 com frete CIF.")).toBe(true);
  });
});

describe("envio de proposta por e-mail", () => {
  it("recusa proposta sem tratativa e aceita com tratativa", async () => {
    const { enviarPropostaEmailImpl } = await import("./propostas-email.server");
    const proposta = {
      id: "p1",
      number: "2026-0001",
      lead_id: "l1",
      sent_at: null,
      validity_days: 10,
      discount_percent: 0,
      payment_term_id: null,
      emitter_id: null,
      transport: {},
      tratativa_comercial: "",
    };
    const sb = {
      from: (t: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              t === "propostas"
                ? { data: proposta, error: null }
                : { data: { id: "l1", company: "ACME", email: "a@b.com" }, error: null },
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(enviarPropostaEmailImpl(sb, "p1", "u1")).rejects.toThrow(
      MSG_TRATATIVA_OBRIGATORIA,
    );

    proposta.tratativa_comercial = "Cliente aceitou 30/60 dias com frete CIF.";
    // Com tratativa, o gate passa e o fluxo segue (falha adiante, não no gate).
    const erro = await enviarPropostaEmailImpl(sb, "p1", "u1").catch((e: Error) => e);
    expect((erro as Error).message).not.toBe(MSG_TRATATIVA_OBRIGATORIA);
    vi.restoreAllMocks();
  });
});
