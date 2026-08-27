import { describe, it, expect } from "vitest";
import { rowToLead, leadToInsert } from "@/lib/crm-sync";
import { computeLeadScore } from "@/lib/lead-score";
import type { Lead } from "@/lib/crm-store";

const baseLead: Lead = {
  id: "11111111-1111-1111-1111-111111111111",
  company: "DRN COMERCIAL LTDA",
  contactName: "Fulano",
  email: "a@b.com",
  phone: "11999999999",
  product: "",
  quantity: 0,
  estimatedValue: 0,
  stage: "novo",
  tags: [],
  source: "",
  createdAt: new Date().toISOString(),
  lastContact: new Date().toISOString(),
  notes: "",
  interactions: [],
  ownerId: "",
  cnpj: "07891077000148",
  razaoSocial: "DRN COMERCIAL LTDA",
  inscricaoEstadual: "903667265",
  porte: "Demais",
  dataAbertura: "2006-03-15",
  capitalSocial: 1_500_000,
  simplesOptante: true,
  socios: [
    { nome: "SOCIO UM", qualificacao: "Sócio-Administrador", desde: "2006-03-15" },
    { nome: "SOCIO DOIS", qualificacao: "Sócio", desde: "2010-01-01" },
  ],
};

describe("crm-sync — campos fiscais da CNPJá", () => {
  it("preserva dataAbertura, capitalSocial, simplesOptante e socios no ida-e-volta", () => {
    const row = leadToInsert(baseLead);
    expect(row.data_abertura).toBe("2006-03-15");
    expect(row.capital_social).toBe(1_500_000);
    expect(row.simples_optante).toBe(true);
    expect(row.socios).toHaveLength(2);

    const back = rowToLead(row as never, [], []);
    expect(back.dataAbertura).toBe("2006-03-15");
    expect(back.capitalSocial).toBe(1_500_000);
    expect(back.simplesOptante).toBe(true);
    expect(back.socios).toHaveLength(2);
  });

  it("grava null quando os campos não foram preenchidos", () => {
    const row = leadToInsert({
      ...baseLead,
      dataAbertura: undefined,
      capitalSocial: undefined,
      simplesOptante: undefined,
      socios: undefined,
    });
    expect(row.data_abertura).toBeNull();
    expect(row.capital_social).toBeNull();
    expect(row.simples_optante).toBeNull();
    expect(row.socios).toBeNull();
  });

  it("o score do lead recarregado deixa de travar em risco médio", () => {
    const recarregado = rowToLead(leadToInsert(baseLead) as never, [], []);
    const score = computeLeadScore(recarregado);
    expect(score.score).toBeGreaterThan(58);
    expect(score.level).toBe("alto");

    // Sem persistência (comportamento antigo) o score desabava
    const semDados = computeLeadScore({ ...recarregado, dataAbertura: undefined, capitalSocial: undefined, socios: undefined, simplesOptante: undefined });
    expect(semDados.score).toBeLessThan(score.score);
  });
});
