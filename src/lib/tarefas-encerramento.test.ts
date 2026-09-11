import { describe, expect, it } from "vitest";
import {
  TIPOS_POR_ETAPA_PEDIDO,
  motivoEncerramento,
  tiposParaEncerrarNaTransicao,
  tiposQueMorremAoEntrarEm,
  tiposQueMorremAoSairDe,
  todosTiposPedido,
} from "./tarefas-encerramento";

describe("mapa por etapa", () => {
  it("cobre as etapas do kanban", () => {
    expect(Object.keys(TIPOS_POR_ETAPA_PEDIDO)).toEqual([
      "analise_financeira",
      "aguardando_pagamento",
      "programacao",
      "em_producao",
      "pronto",
      "faturado_em_rota",
      "pos_venda",
    ]);
  });
  it("tiposQueMorremAoSairDe devolve os tipos da etapa deixada", () => {
    expect(tiposQueMorremAoSairDe("em_producao")).toEqual([
      "acompanhar_producao",
      "cadencia_producao",
    ]);
    expect(tiposQueMorremAoSairDe(null)).toEqual([]);
  });
});

describe("entrar em etapa", () => {
  it("pós-venda mata acompanhamento de atraso e travamento", () => {
    expect(tiposQueMorremAoEntrarEm("pos_venda")).toEqual([
      "previsao_atrasada",
      "prazo_a_vencer",
      "pedido_travado",
    ]);
  });
  it("cancelado/reprovado matam tudo, inclusive pós-venda", () => {
    for (const s of ["cancelado", "reprovado_financeiro"]) {
      const t = tiposQueMorremAoEntrarEm(s);
      expect(t).toEqual(todosTiposPedido());
      expect(t).toContain("pos_venda_pedido");
      expect(t).toContain("comprovacao_entrega");
    }
  });
  it("etapas comuns não matam nada só por entrar", () => {
    expect(tiposQueMorremAoEntrarEm("em_producao")).toEqual([]);
  });
});

describe("transição", () => {
  it("fecha o que ficou para trás e preserva os tipos da etapa nova", () => {
    const t = tiposParaEncerrarNaTransicao("em_producao", "pronto");
    expect(t).toContain("acompanhar_producao");
    expect(t).toContain("cadencia_producao");
    expect(t).not.toContain("cadencia_coleta_entrega");
  });
  it("pronto → pós-venda fecha cadência de coleta e atrasos, mantém pós-venda", () => {
    const t = tiposParaEncerrarNaTransicao("pronto", "pos_venda");
    expect(t).toContain("cadencia_coleta_entrega");
    expect(t).toContain("previsao_atrasada");
    expect(t).not.toContain("pos_venda_pedido");
  });
  it("cancelamento fecha tudo", () => {
    const t = tiposParaEncerrarNaTransicao("em_producao", "cancelado");
    expect(t).toContain("pos_venda_pedido");
    expect(t).toContain("ocorrencia_aberta");
  });
});

describe("motivos", () => {
  it("gera texto legível", () => {
    expect(motivoEncerramento({ causa: "pedido_saiu", stage: "em_producao" })).toBe(
      "pedido saiu de Em Produção",
    );
    expect(motivoEncerramento({ causa: "lead_encerrado", stage: "ganho" })).toBe(
      "lead marcado como Ganho",
    );
    expect(motivoEncerramento({ causa: "cliente_respondido" })).toBe("cliente respondido");
    expect(motivoEncerramento({ causa: "cadencia_substituida", toque: 2 })).toBe(
      "substituída pelo toque 2",
    );
  });
});
