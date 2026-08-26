import { describe, expect, it } from "vitest";
import { ehPedidoDeOptout } from "./whatsapp-inbound.server";
import { normalizarTexto } from "./whatsapp-send.server";

const eh = (s: string) => ehPedidoDeOptout(normalizarTexto(s));

describe("detecção de opt-out", () => {
  it("aceita pedidos genuínos", () => {
    for (const s of [
      "Pare",
      "pare.",
      "PARAR",
      "sair",
      "Pare de me mandar mensagem",
      "não quero mais receber",
      "me tira dessa lista",
      "descadastrar",
    ]) {
      expect(eh(s), s).toBe(true);
    }
  });

  it("não dispara em frases normais", () => {
    for (const s of [
      "Parece que o descritivo leva a essa",
      "pareceu caro",
      "sairemos amanhã para conferir",
      "parede de pallets",
      "pare de brincadeira, mas voltando ao orçamento eu preciso de 200 unidades entregues",
      "bom dia",
      "",
    ]) {
      expect(eh(s), s).toBe(false);
    }
  });
});
