import { describe, expect, it } from "vitest";
import { motivoFalhaLead, mensagemFalhaLead } from "./lead-falha";

describe("motivoFalhaLead", () => {
  it("RLS vira falta de permissão", () => {
    expect(
      motivoFalhaLead({ code: "42501", message: 'new row violates row-level security policy for table "leads"' }),
    ).toBe("sem_permissao");
  });

  it("CNPJ repetido vira duplicado", () => {
    expect(motivoFalhaLead({ code: "23505", message: "duplicate key value" })).toBe("duplicado");
  });

  it("campo obrigatório vira dado inválido", () => {
    expect(motivoFalhaLead({ code: "23502", message: "null value in column" })).toBe("dado_invalido");
  });

  it("rede fora vira conexão, mesmo sem código", () => {
    expect(motivoFalhaLead(new Error("Failed to fetch"))).toBe("conexao");
  });

  it("erro sem pista vira desconhecido", () => {
    expect(motivoFalhaLead({ message: "boom" })).toBe("desconhecido");
  });
});

describe("mensagemFalhaLead", () => {
  it("explica o caso de dono diferente", () => {
    const m = mensagemFalhaLead({ code: "42501" });
    expect(m).toMatch(/outro vendedor/i);
  });

  it("nunca devolve texto vazio", () => {
    expect(mensagemFalhaLead(null).length).toBeGreaterThan(10);
  });
});
