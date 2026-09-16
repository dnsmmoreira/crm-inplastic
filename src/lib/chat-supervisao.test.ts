import { describe, expect, it } from "vitest";
import {
  ordenarConversasSupervisao,
  previaConversa,
  tituloConversaSupervisao,
  type ConversaSupervisao,
} from "./chat-supervisao";

describe("tituloConversaSupervisao", () => {
  it("usa os participantes nas DMs e o nome nos grupos", () => {
    expect(
      tituloConversaSupervisao({ tipo: "direto", nome: null, participantes: ["Pamela", "Renata"] }),
    ).toBe("Pamela ↔ Renata");
    expect(
      tituloConversaSupervisao({
        tipo: "grupo",
        nome: "Grupo Comercial",
        participantes: ["Ana", "Bruno"],
      }),
    ).toBe("Grupo Comercial");
  });

  it("tem fallback quando não sabe quem participa", () => {
    expect(tituloConversaSupervisao({ tipo: "direto", nome: null, participantes: [] })).toBe(
      "Conversa",
    );
  });
});

describe("previaConversa", () => {
  it("normaliza espaços, corta no limite e avisa quando está vazia", () => {
    expect(previaConversa("  oi\n  tudo bem ")).toBe("oi tudo bem");
    expect(previaConversa(null)).toBe("Sem mensagens ainda");
    expect(previaConversa("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

describe("ordenarConversasSupervisao", () => {
  const base = (over: Partial<ConversaSupervisao>): ConversaSupervisao => ({
    canal_id: "c",
    tipo: "direto",
    nome: null,
    participantes: ["Ana", "Bruno"],
    ultima_em: null,
    ultima_previa: null,
    total_mensagens: 0,
    ...over,
  });

  it("mais recente primeiro e sem mensagem no fim, por título", () => {
    const r = ordenarConversasSupervisao([
      base({ canal_id: "sem", participantes: ["Zeca", "Ana"] }),
      base({ canal_id: "velha", ultima_em: "2026-01-01T10:00:00Z" }),
      base({ canal_id: "nova", ultima_em: "2026-02-01T10:00:00Z" }),
      base({ canal_id: "sem2", participantes: ["Bia", "Ana"] }),
    ]);
    expect(r.map((c) => c.canal_id)).toEqual(["nova", "velha", "sem2", "sem"]);
  });
});
