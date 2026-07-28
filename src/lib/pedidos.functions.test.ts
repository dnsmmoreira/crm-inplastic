import { describe, it, expect } from "vitest";
import {
  PEDIDO_STAGES,
  ALLOWED_FORWARD,
  isBackward,
  isTransitionAllowed,
} from "./pedidos.functions";

describe("PEDIDO_STAGES", () => {
  it("possui as 10 etapas esperadas na ordem correta", () => {
    expect(PEDIDO_STAGES.map((s) => s.id)).toEqual([
      "pedido_recebido",
      "em_validacao",
      "aguardando_aprovacao",
      "aprovado_programado",
      "em_producao",
      "separacao_conferencia",
      "faturado_aguardando_coleta",
      "despachado_transporte",
      "pedido_entregue",
      "concluido",
    ]);
  });
});

describe("ALLOWED_FORWARD — cenário Estoque", () => {
  it("aprovado_programado avança direto para separacao_conferencia", () => {
    expect(ALLOWED_FORWARD.aprovado_programado).toContain("separacao_conferencia");
    expect(isTransitionAllowed("aprovado_programado", "separacao_conferencia")).toBe(true);
  });
});

describe("ALLOWED_FORWARD — cenário Produção", () => {
  it("aprovado_programado → em_producao é válido", () => {
    expect(isTransitionAllowed("aprovado_programado", "em_producao")).toBe(true);
  });
  it("em_producao → separacao_conferencia é válido", () => {
    expect(isTransitionAllowed("em_producao", "separacao_conferencia")).toBe(true);
  });
});

describe("ALLOWED_FORWARD — cenário Misto", () => {
  it("aprovado_programado permite ambos os caminhos (produção e estoque)", () => {
    expect(ALLOWED_FORWARD.aprovado_programado).toEqual(
      expect.arrayContaining(["em_producao", "separacao_conferencia"]),
    );
    expect(ALLOWED_FORWARD.aprovado_programado).toHaveLength(2);
  });
});

describe("Cancelado / Bloqueado — regras negativas e de retorno", () => {
  it("retorno (isBackward) é permitido para etapas anteriores", () => {
    expect(isBackward("em_producao", "aprovado_programado")).toBe(true);
    expect(isBackward("separacao_conferencia", "pedido_recebido")).toBe(true);
    expect(isTransitionAllowed("em_producao", "aprovado_programado")).toBe(true);
  });

  it("isBackward é falso para avanços e para a mesma etapa", () => {
    expect(isBackward("em_producao", "separacao_conferencia")).toBe(false);
    expect(isBackward("em_producao", "em_producao")).toBe(false);
  });

  it("isTransitionAllowed(x, x) === false para qualquer etapa", () => {
    for (const s of PEDIDO_STAGES) {
      expect(isTransitionAllowed(s.id, s.id)).toBe(false);
    }
  });

  it("avanço não listado na matriz é recusado", () => {
    // pular etapas
    expect(isTransitionAllowed("pedido_recebido", "em_producao")).toBe(false);
    expect(isTransitionAllowed("em_validacao", "separacao_conferencia")).toBe(false);
    expect(isTransitionAllowed("aprovado_programado", "faturado_aguardando_coleta")).toBe(false);
    expect(isTransitionAllowed("separacao_conferencia", "despachado_transporte")).toBe(false);
  });
});

describe("Etapas terminais — pedido_entregue e concluido", () => {
  it("pedido_entregue só permite avançar para concluido", () => {
    expect(ALLOWED_FORWARD.pedido_entregue).toEqual(["concluido"]);
    expect(isTransitionAllowed("pedido_entregue", "concluido")).toBe(true);
  });

  it("concluido é etapa final (nenhum forward permitido)", () => {
    expect(ALLOWED_FORWARD.concluido).toEqual([]);
    // qualquer avanço a partir de concluido não existe; só retornos são válidos
    expect(isTransitionAllowed("concluido", "pedido_entregue")).toBe(true); // backward
    // e não há forward possível
    for (const s of PEDIDO_STAGES) {
      if (s.id === "concluido") continue;
      // todo destino != concluido é backward a partir de concluido → permitido; forward inexistente
      expect(isBackward("concluido", s.id)).toBe(true);
    }
  });
});

