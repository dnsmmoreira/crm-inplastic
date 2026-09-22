/**
 * Regra do dono único (Denis, set/2026): lead e cliente da mesma empresa são o
 * mesmo cadastro e pertencem sempre ao mesmo vendedor.
 *
 * Aqui ficam as regras PURAS de mensagem:
 *  - documento de outro vendedor: recusa com o texto do banco, que já nomeia o dono;
 *  - telefone de outro vendedor: só aviso, porque o número pode ser compartilhado.
 */
import { describe, it, expect } from "vitest";
import { mensagemDonoTelefone, type DonoCadastro } from "@/lib/consulta-dono";
import { mensagemDoBanco, mensagemFalhaLead } from "@/lib/lead-falha";

const base: DonoCadastro = {
  existe: true,
  semDono: false,
  donoNome: "BIANCA",
  donoEquipe: "Equipe INPLASTIC",
  podeVerRegistro: false,
  empresa: null,
  outraEquipe: true,
};

describe("aviso de telefone repetido", () => {
  it("nomeia o dono e a equipe, sem bloquear", () => {
    const m = mensagemDonoTelefone(base);
    expect(m).toContain("BIANCA");
    expect(m).toContain("Equipe INPLASTIC");
    expect(m).toContain("pode ser compartilhado");
  });

  it("não vaza o nome da empresa para quem não enxerga o registro", () => {
    expect(mensagemDonoTelefone({ ...base, empresa: "ACME LTDA" })).not.toContain("ACME");
    expect(
      mensagemDonoTelefone({ ...base, empresa: "ACME LTDA", podeVerRegistro: true }),
    ).toContain("ACME LTDA");
  });

  it("cadastro sem responsável não acusa ninguém", () => {
    expect(mensagemDonoTelefone({ ...base, semDono: true, donoNome: null })).toContain(
      "sem vendedor responsável",
    );
  });

  it("documento livre não gera aviso", () => {
    expect(mensagemDonoTelefone({ ...base, existe: false })).toBe("");
  });
});

describe("recusa do banco pela regra do dono único", () => {
  it("mostra o texto do banco, que já nomeia o dono", () => {
    const erro = {
      code: "23514",
      message: "Este CNPJ/CPF já está com BIANCA. Fale com essa pessoa antes de seguir.",
    };
    expect(mensagemDoBanco(erro)).toContain("BIANCA");
    expect(mensagemFalhaLead(erro)).toContain("BIANCA");
  });

  it("erro cru do Postgres continua com a mensagem genérica", () => {
    const erro = { code: "23514", message: "new row violates check constraint tarefas_status_chk" };
    expect(mensagemDoBanco(erro)).toBeNull();
    expect(mensagemFalhaLead(erro)).toContain("não foi salvo");
  });
});
