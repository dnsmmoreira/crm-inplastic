import { describe, it, expect } from "vitest";
import {
  CADENCIA_PEDIDO,
  etapasComCadencia,
  passoCadencia,
  textoCadencia,
} from "./pedidos-cadencia";

describe("cadência de pedidos", () => {
  it("não dispara antes do primeiro prazo", () => {
    expect(passoCadencia("analise_financeira", 0)).toBeNull();
    expect(passoCadencia("em_producao", 2)).toBeNull();
  });

  it("cobra o grupo responsável no primeiro toque", () => {
    const p = passoCadencia("analise_financeira", 1)!;
    expect(p.nivel).toBe(1);
    expect(p.grupo).toBe("financeiro");
    expect(p.escalarGestao).toBe(false);
    expect(p.escalarDiretoria).toBe(false);
  });

  it("escala para gestão no segundo toque", () => {
    const p = passoCadencia("programacao", 3)!;
    expect(p.nivel).toBe(2);
    expect(p.escalarGestao).toBe(true);
    expect(p.escalarDiretoria).toBe(false);
  });

  it("escala para diretoria no último toque e não avança além dele", () => {
    const p = passoCadencia("em_producao", 12)!;
    expect(p.nivel).toBe(3);
    expect(p.ultimo).toBe(true);
    expect(p.escalarDiretoria).toBe(true);
    const muitoDepois = passoCadencia("em_producao", 40)!;
    expect(muitoDepois.passo).toBe(12);
    expect(muitoDepois.nivel).toBe(3);
  });

  it("ignora etapas sem cadência", () => {
    expect(passoCadencia("pos_venda", 30)).toBeNull();
    expect(passoCadencia("reprovado_financeiro", 30)).toBeNull();
  });

  it("expõe as etapas configuradas", () => {
    expect(etapasComCadencia()).toEqual(Object.keys(CADENCIA_PEDIDO));
    expect(etapasComCadencia()).toContain("aguardando_pagamento");
  });

  it("gera texto com o toque, a régua e a prioridade correta", () => {
    const p = passoCadencia("programacao", 5)!;
    const t = textoCadencia(p, { numero: "PED-2026-0007", label: "Liberado", dias: 5 });
    expect(t.titulo).toContain("3ª cobrança");
    expect(t.titulo).toContain("ESCALADO À DIRETORIA");
    expect(t.descricao).toContain("régua 1/3/5 dias");
    expect(t.prioridade).toBe(0);
  });

  it("réguas são crescentes e sem repetição", () => {
    for (const [stage, cfg] of Object.entries(CADENCIA_PEDIDO)) {
      const ordenada = [...cfg.dias].sort((a, b) => a - b);
      expect(cfg.dias, stage).toEqual(ordenada);
      expect(new Set(cfg.dias).size, stage).toBe(cfg.dias.length);
    }
  });
});
