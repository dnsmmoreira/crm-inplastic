import { describe, it, expect } from "vitest";
import { mapearMensagemCloud } from "./whatsapp-cloud-mapeamento";

describe("mapearMensagemCloud", () => {
  it("texto", () => {
    const r = mapearMensagemCloud({ type: "text", text: { body: " Olá " } });
    expect(r).toMatchObject({ tipo: "texto", texto: "Olá", silencioso: false });
  });

  it("imagem sem legenda", () => {
    const r = mapearMensagemCloud({ type: "image", image: { id: "m1", mime_type: "image/jpeg" } });
    expect(r).toMatchObject({ tipo: "imagem", texto: "[imagem]", mediaId: "m1", caption: null });
  });

  it("imagem com legenda", () => {
    const r = mapearMensagemCloud({
      type: "image",
      image: { id: "m1", mime_type: "image/jpeg", caption: "meu pallet" },
    });
    expect(r.texto).toBe("meu pallet");
    expect(r.caption).toBe("meu pallet");
  });

  it("documento usa o nome do arquivo", () => {
    const r = mapearMensagemCloud({
      type: "document",
      document: { id: "d1", mime_type: "application/pdf", filename: "pedido.pdf" },
    });
    expect(r).toMatchObject({
      tipo: "documento",
      texto: "[documento: pedido.pdf]",
      fileName: "pedido.pdf",
    });
  });

  it("audio de voz", () => {
    const r = mapearMensagemCloud({
      type: "audio",
      audio: { id: "a1", mime_type: "audio/ogg", voice: true },
    });
    expect(r).toMatchObject({ tipo: "audio", texto: "[áudio]", mediaId: "a1" });
    expect(r.extra).toEqual({ voice: true });
  });

  it("figurinha", () => {
    const r = mapearMensagemCloud({ type: "sticker", sticker: { id: "s1", mime_type: "image/webp" } });
    expect(r).toMatchObject({ tipo: "figurinha", texto: "[figurinha]", mediaId: "s1" });
  });

  it("botão de template", () => {
    const r = mapearMensagemCloud({ type: "button", button: { text: "Quero orçamento", payload: "P1" } });
    expect(r).toMatchObject({ tipo: "texto", texto: "Quero orçamento" });
  });

  it("interactive list_reply", () => {
    const r = mapearMensagemCloud({
      type: "interactive",
      interactive: { type: "list_reply", list_reply: { id: "op2", title: "Pallet 1200x1000" } },
    });
    expect(r).toMatchObject({ tipo: "resposta_opcao", texto: "Pallet 1200x1000" });
  });

  it("reação é silenciosa", () => {
    const r = mapearMensagemCloud({ type: "reaction", reaction: { emoji: "👍", message_id: "x" } });
    expect(r).toMatchObject({ tipo: "reacao", texto: "Reagiu com 👍", silencioso: true });
  });

  it("localização", () => {
    const r = mapearMensagemCloud({
      type: "location",
      location: { latitude: -23.5, longitude: -46.6, name: "Fábrica" },
    });
    expect(r.tipo).toBe("localizacao");
    expect(r.texto).toContain("-23.5,-46.6");
  });

  it("contato compartilhado", () => {
    const r = mapearMensagemCloud({
      type: "contacts",
      contacts: [{ name: { formatted_name: "João" } }],
    });
    expect(r).toMatchObject({ tipo: "contato", texto: "[contato compartilhado: João]" });
  });

  it("não suportado", () => {
    const r = mapearMensagemCloud({ type: "unsupported" });
    expect(r).toMatchObject({
      tipo: "desconhecido",
      texto: "[mensagem não suportada pelo WhatsApp]",
    });
  });
});
