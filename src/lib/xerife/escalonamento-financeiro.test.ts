import { describe, it, expect } from "vitest";
import { deveEscalarFinanceiro } from "./escalonamento-financeiro";

const agora = new Date("2026-09-02T12:00:00.000Z");
const hAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

const base = {
  stage: "analise_financeira",
  aprovacao_decisao: null as string | null,
  entrou_na_etapa_em: hAtras(25),
  ultimo_escalonamento_em: null as string | null,
};

describe("deveEscalarFinanceiro", () => {
  it("escala quando entrou há 25h sem decisão", () => {
    const r = deveEscalarFinanceiro(base, agora);
    expect(r.escalar).toBe(true);
    expect(r.horasParado).toBe(25);
  });

  it("não escala com 23h na etapa", () => {
    expect(deveEscalarFinanceiro({ ...base, entrou_na_etapa_em: hAtras(23) }, agora)).toMatchObject({
      escalar: false,
      motivo: "dentro_do_sla",
    });
  });

  it("não escala quando já houve decisão", () => {
    expect(deveEscalarFinanceiro({ ...base, aprovacao_decisao: "aprovado" }, agora)).toMatchObject({
      escalar: false,
      motivo: "ja_decidido",
    });
  });

  it("não escala quando já escalou há 3h", () => {
    expect(
      deveEscalarFinanceiro({ ...base, ultimo_escalonamento_em: hAtras(3) }, agora),
    ).toMatchObject({ escalar: false, motivo: "escalado_recentemente" });
  });

  it("escala de novo quando o último escalonamento foi há 25h", () => {
    expect(
      deveEscalarFinanceiro(
        { ...base, entrou_na_etapa_em: hAtras(50), ultimo_escalonamento_em: hAtras(25) },
        agora,
      ),
    ).toMatchObject({ escalar: true });
  });

  it("não escala fora da etapa de análise financeira", () => {
    expect(deveEscalarFinanceiro({ ...base, stage: "programacao" }, agora)).toMatchObject({
      escalar: false,
      motivo: "etapa_diferente",
    });
  });

  it("não escala sem data de entrada confiável", () => {
    expect(deveEscalarFinanceiro({ ...base, entrou_na_etapa_em: null }, agora)).toMatchObject({
      escalar: false,
      motivo: "sem_data",
    });
  });
});
