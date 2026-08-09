import { describe, expect, it } from "vitest";
import { limparOrigemAnuncio } from "./mensagem-display";

describe("limparOrigemAnuncio", () => {
  it("remove o bloco de Origem completo", () => {
    const texto = [
      "Nova solicitação de orçamento",
      "*Nome:* Wemeson",
      "*Empresa:* ACME",
      "*E-mail:* a@b.com",
      "*Telefone:* 11999999999",
      "*Produto de interesse:* Pallet PBR",
      "",
      "*Origem:*",
      "- Página de entrada: /?gad_source=1&gad_campaignid=123&gbraid=x&gclid=Cjw",
      "- ID do clique: Cjw0123",
    ].join("\n");

    const out = limparOrigemAnuncio(texto);
    expect(out).not.toMatch(/Origem/);
    expect(out).not.toMatch(/gclid/);
    expect(out).not.toMatch(/ID do clique/);
    expect(out).toContain("*Produto de interesse:* Pallet PBR");
    expect(out).toContain("*Nome:* Wemeson");
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("devolve o texto identico quando nao ha bloco de Origem", () => {
    const texto = "Oi, bom dia!\nQuero um orçamento de pallets.";
    expect(limparOrigemAnuncio(texto)).toBe(texto);
  });

  it("mantem Produto de interesse quando vem depois do bloco de Origem", () => {
    const texto = [
      "*Nome:* João",
      "Origem:",
      "- Pagina de entrada: /?fbclid=abc",
      "- Click ID: abc123",
      "*Produto de interesse:* Caixa 30L",
      "*Telefone:* 11888887777",
    ].join("\n");

    const out = limparOrigemAnuncio(texto);
    expect(out).toContain("*Produto de interesse:* Caixa 30L");
    expect(out).toContain("*Telefone:* 11888887777");
    expect(out).not.toMatch(/Origem/);
    expect(out).not.toMatch(/fbclid/);
  });
});
