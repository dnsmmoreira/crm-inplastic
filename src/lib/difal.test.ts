import { describe, it, expect } from "vitest";
import { calcularDifal, semInscricaoEstadual, DIFAL_ALIQUOTAS_PADRAO } from "./difal";

describe("calcularDifal", () => {
  it("caso real Associação (ES, sem IE, R$ 1.000) → R$ 134,82", () => {
    const r = calcularDifal({ valorOperacao: 1000, ufDestino: "ES" });
    expect(r.aplica).toBe(true);
    expect(r.valor).toBe(134.82);
    expect(r.aliquotaInterna).toBe(17);
    expect(r.aliquotaInterestadual).toBe(7);
    expect(1000 + r.valor).toBe(1134.82);
  });

  it("não aplica com inscrição estadual preenchida", () => {
    const r = calcularDifal({ valorOperacao: 1000, ufDestino: "ES", inscricaoEstadual: "123456" });
    expect(r.aplica).toBe(false);
    expect(r.motivo).toBe("com_inscricao_estadual");
    expect(r.valor).toBe(0);
  });

  it("não aplica quando marcado como isento de IE", () => {
    const r = calcularDifal({ valorOperacao: 1000, ufDestino: "ES", ieIsento: true });
    expect(r.aplica).toBe(false);
    expect(r.motivo).toBe("isento_ie");
  });

  it("não aplica em operação interna (destino SP)", () => {
    const r = calcularDifal({ valorOperacao: 1000, ufDestino: "sp" });
    expect(r.aplica).toBe(false);
    expect(r.motivo).toBe("uf_origem");
  });

  it("não aplica sem UF de destino conhecida", () => {
    expect(calcularDifal({ valorOperacao: 1000, ufDestino: null }).motivo).toBe("uf_desconhecida");
    expect(calcularDifal({ valorOperacao: 1000, ufDestino: "XX" }).motivo).toBe("uf_desconhecida");
  });

  it("usa 12% para MG e 7% para BA", () => {
    expect(calcularDifal({ valorOperacao: 1000, ufDestino: "MG" }).aliquotaInterestadual).toBe(12);
    expect(calcularDifal({ valorOperacao: 1000, ufDestino: "BA" }).aliquotaInterestadual).toBe(7);
  });

  it("MG R$ 1.000: 1000/0,82*0,18 − 120 = 99,51", () => {
    expect(calcularDifal({ valorOperacao: 1000, ufDestino: "MG" }).valor).toBe(99.51);
  });

  it("aceita tabela vinda do banco (admin editável)", () => {
    const r = calcularDifal({
      valorOperacao: 1000,
      ufDestino: "ES",
      aliquotas: [{ uf: "ES", aliquota_interna: 20, aliquota_interestadual: 7 }],
    });
    expect(r.aliquotaInterna).toBe(20);
    expect(r.valor).toBe(180);
  });

  it("valor zero não gera DIFAL", () => {
    expect(calcularDifal({ valorOperacao: 0, ufDestino: "ES" }).valor).toBe(0);
  });

  it("tabela padrão cobre as 27 UFs", () => {
    expect(DIFAL_ALIQUOTAS_PADRAO).toHaveLength(27);
  });

  it("semInscricaoEstadual trata 'ISENTO' escrito no campo", () => {
    expect(semInscricaoEstadual("", false)).toBe(true);
    expect(semInscricaoEstadual("ISENTO", false)).toBe(true);
    expect(semInscricaoEstadual("123", false)).toBe(false);
    expect(semInscricaoEstadual("", true)).toBe(false);
  });
});
