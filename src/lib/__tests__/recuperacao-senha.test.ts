import { describe, expect, it } from "vitest";

import { __test__, MSG_RECUPERACAO_GENERICA } from "@/lib/invites.functions";
import { mensagemErroSenha } from "@/lib/senha-mensagens";
import { MSG_CONTA_DESATIVADA } from "@/lib/recuperacao.functions";

describe("esqueci minha senha", () => {
  it("responde sempre a mesma frase genérica", () => {
    expect(MSG_RECUPERACAO_GENERICA).toBe(
      "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
    );
  });

  it("limite por e-mail é de 3 pedidos na janela", () => {
    const chave = `teste-email-${Math.random()}`;
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(true);
    expect(__test__.rateLimit(chave, 3, 60_000)).toBe(false);
  });

  it("limite por IP é de 10 pedidos na janela", () => {
    const chave = `teste-ip-${Math.random()}`;
    for (let i = 0; i < 10; i += 1) {
      expect(__test__.rateLimit(chave, 10, 60_000)).toBe(true);
    }
    expect(__test__.rateLimit(chave, 10, 60_000)).toBe(false);
  });

  it("extrai o primeiro IP da cadeia de proxies", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(__test__.ipDoPedido(h)).toBe("203.0.113.9");
    expect(__test__.ipDoPedido(new Headers())).toBe("desconhecido");
  });

  it("o link de recuperação usa o helper de endereço, nunca endereço fixo", () => {
    expect(__test__.redirectDefinirSenha()).toBe(`${__test__.appBaseUrl()}/definir-senha`);
    expect(__test__.redirectDefinirSenha()).toMatch(/^https?:\/\/.+\/definir-senha$/);
  });

  it("conta desativada tem a mesma mensagem do login", () => {
    expect(MSG_CONTA_DESATIVADA).toBe("Conta desativada. Fale com o administrador.");
  });
});

describe("mensagens de recusa de senha", () => {
  it("traduz senha vazada", () => {
    expect(mensagemErroSenha("This password has been pwned 12 times")).toMatch(/vazamentos/);
  });
  it("traduz link expirado", () => {
    expect(mensagemErroSenha("Invalid or expired token")).toMatch(/expirou/);
  });
  it("nunca devolve o texto bruto do provedor", () => {
    expect(mensagemErroSenha("weird provider blob")).toBe(
      "Não foi possível salvar a senha. Tente novamente.",
    );
  });
});
