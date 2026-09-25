import { describe, expect, it } from "vitest";
import { precisaSeparadorData, rotuloDia, trechoCitado } from "./chat-interno";

const local = (y: number, m: number, d: number, h = 12, mi = 0) =>
  new Date(y, m - 1, d, h, mi).toISOString();

describe("separador de data", () => {
  it("primeira mensagem sempre recebe separador", () => {
    expect(precisaSeparadorData(local(2026, 9, 25), null)).toBe(true);
    expect(precisaSeparadorData(local(2026, 9, 25), undefined)).toBe(true);
  });
  it("mesmo dia não repete", () => {
    expect(precisaSeparadorData(local(2026, 9, 25, 23, 59), local(2026, 9, 25, 0, 0))).toBe(false);
  });
  it("virada de meia-noite gera separador", () => {
    expect(precisaSeparadorData(local(2026, 9, 26, 0, 0), local(2026, 9, 25, 23, 59))).toBe(true);
  });
  it("virada de ano", () => {
    expect(precisaSeparadorData(local(2027, 1, 1, 0, 1), local(2026, 12, 31, 23, 59))).toBe(true);
  });
  it("data inválida não quebra", () => {
    expect(precisaSeparadorData("xx", local(2026, 9, 25))).toBe(true);
  });
});

describe("rótulo do dia", () => {
  const agora = new Date(2026, 8, 25, 10, 0);
  it("Hoje / Ontem / data", () => {
    expect(rotuloDia(local(2026, 9, 25, 0, 1), agora)).toBe("Hoje");
    expect(rotuloDia(local(2026, 9, 24, 23, 59), agora)).toBe("Ontem");
    expect(rotuloDia(local(2026, 9, 23), agora)).toBe("23/09/2026");
  });
  it("ontem atravessando mês e ano", () => {
    expect(rotuloDia(local(2026, 12, 31), new Date(2027, 0, 1, 8))).toBe("Ontem");
    expect(rotuloDia(local(2026, 9, 30), new Date(2026, 9, 1, 8))).toBe("Ontem");
  });
});

describe("trecho citado", () => {
  it("texto curto fica igual, quebras viram espaço", () => {
    expect(trechoCitado({ conteudo: "  oi\n\ntudo bem?  " })).toBe("oi tudo bem?");
  });
  it("texto longo é cortado com reticências", () => {
    const t = trechoCitado({ conteudo: "a".repeat(300) }, 10);
    expect(t).toBe("aaaaaaaaaa…");
  });
  it("exatamente no limite não ganha reticências", () => {
    expect(trechoCitado({ conteudo: "abcde" }, 5)).toBe("abcde");
  });
  it("só anexo mostra o nome do arquivo", () => {
    expect(trechoCitado({ conteudo: "   ", anexo_nome: "nota.pdf" })).toBe("📎 nota.pdf");
  });
  it("vazia sem anexo e ausente", () => {
    expect(trechoCitado({ conteudo: "" })).toBe("Mensagem sem texto");
    expect(trechoCitado(null)).toBe("Mensagem indisponível");
  });
});
