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
  atalhoSemPendencia,
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
  it("sem pendência: exige o motivo estruturado", () => {
    expect(validarDesfecho({ tipo: "sem_pendencia", detalhe: "ok" }, { agora }).ok).toBe(false);
    expect(
      validarDesfecho(
        { tipo: "sem_pendencia", motivo_sem_pendencia: "ja_resolvido_outro_canal" },
        { agora },
      ).ok,
    ).toBe(true);
  });
});

describe("transferir e sem_pendencia estruturado", () => {
  const agora = new Date("2026-03-10T12:00:00Z");
  const uuid = "11111111-2222-3333-4444-555555555555";
  it("transferir exige vendedor e motivo", () => {
    expect(validarDesfecho({ tipo: "transferir" }, { agora }).ok).toBe(false);
    expect(validarDesfecho({ tipo: "transferir", novo_dono: uuid }, { agora }).ok).toBe(false);
    expect(
      validarDesfecho({ tipo: "transferir", novo_dono: uuid, detalhe: "cliente é da Bianca" }, { agora }).ok,
    ).toBe(true);
  });
  it("sem pendência exige motivo estruturado", () => {
    expect(validarDesfecho({ tipo: "sem_pendencia", detalhe: "qualquer coisa" }, { agora }).ok).toBe(false);
    expect(
      validarDesfecho({ tipo: "sem_pendencia", motivo_sem_pendencia: "duplicado" }, { agora }).ok,
    ).toBe(true);
    expect(
      validarDesfecho({ tipo: "sem_pendencia", motivo_sem_pendencia: "outro", detalhe: "curto" }, { agora }).ok,
    ).toBe(false);
  });
  it("fora do portfólio é atalho de perda; não é meu cliente vira transferência", () => {
    expect(atalhoSemPendencia("fora_portfolio")).toEqual({ tipo: "perdido", motivo: "Lead inválido" });
    expect(atalhoSemPendencia("cliente_nao_e_meu")?.tipo).toBe("transferir");
    expect(atalhoSemPendencia("duplicado")).toBeNull();
  });
});
