import { describe, it, expect } from "vitest";
import {
  formatarPrazo,
  horasAteOPrazo,
  limiteDoPrazo,
  pedidoAtrasado,
  prazoAVencer,
  prazoCobravel,
  prazoEfetivo,
  usandoPrazoReal,
} from "./pedido-prazo";

const em = (iso: string) => new Date(iso);

describe("prazoEfetivo", () => {
  it("usa o prazo real quando existe", () => {
    expect(
      prazoEfetivo({ previsao_entrega: "2026-09-10T00:00:00Z", prazo_real_entrega: "2026-09-25" }),
    ).toBe("2026-09-25");
    expect(usandoPrazoReal({ prazo_real_entrega: "2026-09-25" })).toBe(true);
  });

  it("cai no prazo original quando não há prazo real", () => {
    expect(prazoEfetivo({ previsao_entrega: "2026-09-10T00:00:00Z" })).toBe(
      "2026-09-10T00:00:00Z",
    );
    expect(usandoPrazoReal({ previsao_entrega: "2026-09-10T00:00:00Z" })).toBe(false);
  });

  it("sem nenhum prazo devolve null", () => {
    expect(prazoEfetivo({})).toBeNull();
    expect(horasAteOPrazo({})).toBeNull();
    expect(pedidoAtrasado({})).toBe(false);
    expect(prazoAVencer({})).toBe(false);
  });
});

describe("limiteDoPrazo", () => {
  it("é o fim do dia em São Paulo (02:59:59.999Z do dia seguinte)", () => {
    expect(limiteDoPrazo("2026-09-10")?.toISOString()).toBe("2026-09-11T02:59:59.999Z");
  });
  it("aceita timestamp e ignora a hora", () => {
    expect(limiteDoPrazo("2026-09-10T13:20:00Z")?.toISOString()).toBe("2026-09-11T02:59:59.999Z");
  });
  it("rejeita valor inválido", () => {
    expect(limiteDoPrazo("15 dias")).toBeNull();
    expect(limiteDoPrazo(null)).toBeNull();
  });
});

describe("pedidoAtrasado", () => {
  const p = { previsao_entrega: "2026-09-10", stage: "pronto" };

  it("não está atrasado durante o próprio dia do prazo", () => {
    expect(pedidoAtrasado(p, em("2026-09-10T20:00:00Z"))).toBe(false);
  });
  it("fica atrasado depois do fim do dia em SP", () => {
    expect(pedidoAtrasado(p, em("2026-09-11T04:00:00Z"))).toBe(true);
  });
  it("prazo real adiado tira o pedido do atraso", () => {
    expect(
      pedidoAtrasado(
        { ...p, prazo_real_entrega: "2026-09-30" },
        em("2026-09-11T04:00:00Z"),
      ),
    ).toBe(false);
  });
  it("etapas terminais não cobram prazo", () => {
    expect(pedidoAtrasado({ ...p, stage: "pos_venda" }, em("2026-10-01T12:00:00Z"))).toBe(false);
    expect(pedidoAtrasado({ ...p, stage: "cancelado" }, em("2026-10-01T12:00:00Z"))).toBe(false);
    expect(prazoCobravel("faturado_em_rota")).toBe(true);
  });
});

describe("prazoAVencer (48h)", () => {
  const p = { previsao_entrega: "2026-09-10", stage: "faturado_em_rota" };

  it("avisa dentro da janela de 48h", () => {
    // limite = 2026-09-11T02:59:59.999Z → 40h antes
    expect(prazoAVencer(p, em("2026-09-09T11:00:00Z"))).toBe(true);
  });
  it("não avisa antes da janela", () => {
    expect(prazoAVencer(p, em("2026-09-08T00:00:00Z"))).toBe(false);
  });
  it("não avisa depois de vencido (aí já é atraso)", () => {
    expect(prazoAVencer(p, em("2026-09-11T04:00:00Z"))).toBe(false);
    expect(pedidoAtrasado(p, em("2026-09-11T04:00:00Z"))).toBe(true);
  });
  it("respeita o prazo real quando existe", () => {
    const comReal = { ...p, prazo_real_entrega: "2026-09-20" };
    expect(prazoAVencer(comReal, em("2026-09-09T11:00:00Z"))).toBe(false);
    expect(prazoAVencer(comReal, em("2026-09-19T12:00:00Z"))).toBe(true);
  });
});

describe("formatarPrazo", () => {
  it("formata dd/MM/yyyy", () => {
    expect(formatarPrazo("2026-09-10")).toBe("10/09/2026");
    expect(formatarPrazo(null)).toBe("—");
  });
});
