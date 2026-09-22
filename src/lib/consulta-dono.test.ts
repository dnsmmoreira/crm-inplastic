import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mascararDocumento,
  mensagemDonoDuplicado,
  mensagemNomeParecido,
  mensagemProntaParaDono,
  normalizarDocumento,
  podeAvisarDono,
  textoAuditoriaConsulta,
  DONO_NAO_ENCONTRADO,
  type DonoCadastro,
} from "@/lib/consulta-dono";

const base: DonoCadastro = {
  existe: true,
  semDono: false,
  donoNome: "DANIEL F. MOREIRA",
  donoEquipe: "INPLASTIC",
  podeVerRegistro: false,
  empresa: null,
  outraEquipe: true,
};

describe("normalização de documento", () => {
  it("tira pontos, barras e traços dos dois lados", () => {
    expect(normalizarDocumento("10.717.170/0001-45")).toBe("10717170000145");
    expect(normalizarDocumento("10717170000145")).toBe("10717170000145");
    expect(normalizarDocumento("10.717.170/0001-45")).toBe(normalizarDocumento("10717170000145"));
    expect(normalizarDocumento(null)).toBe("");
  });

  it("mascara deixando só os 4 últimos dígitos", () => {
    expect(mascararDocumento("10.717.170/0001-45")).toBe("****0145");
    expect(mascararDocumento("")).toBe("****");
  });

  it("o texto da auditoria leva o documento mascarado", () => {
    expect(textoAuditoriaConsulta("10717170000145", "INPLASTIC")).toBe(
      "consulta de dono: CNPJ ****0145 → equipe INPLASTIC",
    );
  });
});

describe("mensagem de duplicidade", () => {
  it("outra equipe: mostra dono e equipe, nunca a empresa", () => {
    const msg = mensagemDonoDuplicado({ ...base, empresa: null });
    expect(msg).toContain("DANIEL F. MOREIRA");
    expect(msg).toContain("Equipe INPLASTIC");
    expect(msg).not.toContain("Cadastro:");
  });

  it("mesma equipe (enxerga o registro): mostra também a empresa", () => {
    const msg = mensagemDonoDuplicado({
      ...base,
      outraEquipe: false,
      podeVerRegistro: true,
      empresa: "ELO SOLUCAO",
    });
    expect(msg).toContain("ELO SOLUCAO");
  });

  it("dono inativo ou inexistente: sem responsável", () => {
    const msg = mensagemDonoDuplicado({ ...base, semDono: true, donoNome: null });
    expect(msg).toBe(
      "Já existe cadastro deste CNPJ, sem vendedor responsável. Fale com o administrador.",
    );
  });

  it("documento inexistente: nenhuma mensagem", () => {
    expect(mensagemDonoDuplicado(DONO_NAO_ENCONTRADO)).toBe("");
  });

  it("nome parecido também revela o dono", () => {
    expect(mensagemNomeParecido(base)).toContain("DANIEL F. MOREIRA");
  });
});

describe('botão "Avisar o dono"', () => {
  it("só aparece dentro da equipe (o chat não conversa entre equipes)", () => {
    expect(podeAvisarDono(base, false)).toBe(false);
    expect(podeAvisarDono({ ...base, outraEquipe: false }, true)).toBe(true);
    expect(podeAvisarDono({ ...base, semDono: true, donoNome: null }, true)).toBe(false);
  });

  it("a mensagem pronta cita só o documento", () => {
    expect(mensagemProntaParaDono("10.717.170/0001-45")).toBe(
      "Oi, o cliente CNPJ 10717170000145 está com você? Tenho um contato dele.",
    );
  });
});

describe("limite e auditoria no servidor", () => {
  const server = readFileSync("src/lib/consulta-dono.server.ts", "utf8");
  const rate = readFileSync("src/lib/rate-limit.server.ts", "utf8");

  it("o limite é contado no banco, não em memória", () => {
    expect(rate).toContain("registrar_tentativa");
    expect(server).toContain("consumirTentativa");
    expect(server).toContain("CONSULTA_LIMITE = 30");
  });

  it("a auditoria só grava quando revela dono de outra equipe", () => {
    expect(server).toContain("if (outraEquipe && info.donoNome)");
    expect(server).toContain("textoAuditoriaConsulta");
    expect(server).toContain("alvo_user_id");
    expect(server).toContain("ator_user_id");
  });
});
