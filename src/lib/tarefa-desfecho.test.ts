import { describe, expect, it } from "vitest";
import {
  carenciaHorasUteis,
  dataRetornoParaISO,
  ddmm,
  etapasAvancoPermitidas,
  exigeDesfecho,
  proximaEtapa,
  proximoDiaUtil,
  somarDiasUteis,
  sufixoCobranca,
  validarDesfecho,
} from "./tarefa-desfecho";

describe("exigeDesfecho", () => {
  const base = { origem: "xerife", tipo: "follow_up", lead_id: "l1", pedido_id: null };
  it("exige em tarefa comercial do Xerife ligada a lead", () => {
    expect(exigeDesfecho(base)).toBe(true);
  });
  it("não exige em tarefa manual, de pedido ou pós-venda", () => {
    expect(exigeDesfecho({ ...base, origem: "manual" })).toBe(false);
    expect(exigeDesfecho({ ...base, pedido_id: "p1" })).toBe(false);
    expect(exigeDesfecho({ ...base, tipo: "pos_venda_satisfacao" })).toBe(false);
    expect(exigeDesfecho({ ...base, lead_id: null })).toBe(false);
  });
});

describe("etapas", () => {
  it("segue a ordem do funil e trava em negociação", () => {
    expect(proximaEtapa("novo")).toBe("qualificacao");
    expect(proximaEtapa("qualificacao")).toBe("proposta");
    expect(proximaEtapa("proposta")).toBe("negociacao");
    expect(proximaEtapa("negociacao")).toBeNull();
    expect(etapasAvancoPermitidas("negociacao")).toEqual([]);
  });
});

describe("carência e cobrança", () => {
  it("usa horas úteis por tipo", () => {
    expect(carenciaHorasUteis("follow_up")).toBe(20);
    expect(carenciaHorasUteis("resposta_pendente")).toBe(12);
    expect(carenciaHorasUteis("cadencia_proposta")).toBe(0);
    expect(carenciaHorasUteis("pos_venda_recompra")).toBe(300);
  });
  it("numera a cobrança a partir da segunda", () => {
    expect(sufixoCobranca(1)).toBe("");
    expect(sufixoCobranca(2)).toBe(" · 2ª cobrança");
    expect(sufixoCobranca(4)).toBe(" · 4ª cobrança");
  });
});

describe("datas", () => {
  it("ancora o retorno ao meio-dia UTC", () => {
    expect(dataRetornoParaISO("2026-03-10")).toBe("2026-03-10T12:00:00.000Z");
    expect(ddmm("2026-03-10")).toBe("10/03");
  });
  it("próximo dia útil pula fim de semana", () => {
    // 2026-03-06 é sexta → próximo útil é segunda 09
    expect(proximoDiaUtil(new Date("2026-03-06T12:00:00Z"))).toBe("2026-03-09");
    expect(somarDiasUteis(3, new Date("2026-03-06T12:00:00Z"))).toBe("2026-03-11");
  });
});

describe("validarDesfecho", () => {
  const agora = new Date("2026-03-10T12:00:00Z");
  it("recusa desfecho desconhecido", () => {
    expect(validarDesfecho({ tipo: "xpto" }, { agora })).toEqual({
      ok: false,
      erro: "Escolha o desfecho desta tarefa.",
    });
  });
  it("retorno: exige data futura e dentro de 60 dias", () => {
    expect(validarDesfecho({ tipo: "retorno_agendado" }, { agora }).ok).toBe(false);
    expect(validarDesfecho({ tipo: "retorno_agendado", data: "2026-03-09" }, { agora }).ok).toBe(false);
    expect(validarDesfecho({ tipo: "retorno_agendado", data: "2026-03-11" }, { agora }).ok).toBe(true);
    expect(validarDesfecho({ tipo: "retorno_agendado", data: "2026-07-01" }, { agora }).ok).toBe(false);
  });
  it("avanço: só aceita a etapa permitida", () => {
    expect(validarDesfecho({ tipo: "avancou_etapa", stage: "proposta" }, { stageAtual: "qualificacao", agora }).ok).toBe(true);
    expect(validarDesfecho({ tipo: "avancou_etapa", stage: "ganho" }, { stageAtual: "qualificacao", agora }).ok).toBe(false);
    expect(validarDesfecho({ tipo: "avancou_etapa", stage: "ganho" }, { stageAtual: "negociacao", agora }).ok).toBe(false);
  });
  it("perdido: exige motivo canônico; detalhe é opcional", () => {
    expect(validarDesfecho({ tipo: "perdido", motivo: "Preço" }, { agora }).ok).toBe(true);
    expect(validarDesfecho({ tipo: "perdido", motivo: "Outro" }, { agora }).ok).toBe(false);
  });
  it("sem pendência: exige justificativa curta", () => {
    expect(validarDesfecho({ tipo: "sem_pendencia", detalhe: "ok" }, { agora }).ok).toBe(false);
    expect(validarDesfecho({ tipo: "sem_pendencia", detalhe: "já respondeu por e-mail" }, { agora }).ok).toBe(true);
  });
});
