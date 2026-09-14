import { describe, expect, it } from "vitest";
import { deveAvisarChat } from "./chat-som";

describe("deveAvisarChat", () => {
  it("não toca na primeira leitura", () => {
    expect(deveAvisarChat(null, 5)).toBe(false);
  });

  it("toca só quando o total aumenta", () => {
    expect(deveAvisarChat(1, 3)).toBe(true);
    expect(deveAvisarChat(3, 3)).toBe(false);
    expect(deveAvisarChat(3, 0)).toBe(false);
  });
});
