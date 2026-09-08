import { describe, it, expect } from "vitest";
import {
  dataValidade,
  propostaVencida,
  diasVencida,
  validadeYmd,
  rascunhoParado,
  tagProposta,
  ddmmProposta,
} from "@/lib/proposta-prazo";
import { desfechosParaTipo, validarDesfecho, carenciaHorasUteis } from "@/lib/tarefa-desfecho";

const enviada = (over: Record<string, unknown> = {}) => ({
  status: "enviada",
  sent_at: "2026-01-01T12:00:00.000Z",
  validity_days: 15,
  prorrogada_ate: null,
  ...over,
});

describe("proposta-prazo", () => {
  it("validade = sent_at + validity_days", () => {
    expect(validadeYmd(enviada())).toBe("2026-01-16");
  });

  it("prorrogada_ate manda na validade", () => {
    expect(validadeYmd(enviada({ prorrogada_ate: "2026-02-10" }))).toBe("2026-02-10");
  });

  it("rascunho e pedido nunca vencem", () => {
    expect(propostaVencida(enviada({ status: "rascunho" }), new Date("2027-01-01"))).toBe(false);
    expect(propostaVencida(enviada({ status: "pedido" }), new Date("2027-01-01"))).toBe(false);
  });

  it("vence depois do prazo e conta os dias", () => {
    expect(propostaVencida(enviada(), new Date("2026-01-10T12:00:00Z"))).toBe(false);
    expect(propostaVencida(enviada(), new Date("2026-01-20T12:00:00Z"))).toBe(true);
    expect(diasVencida(enviada(), new Date("2026-01-20T12:00:00Z"))).toBe(4);
  });

  it("sem sent_at não vence", () => {
    expect(dataValidade(enviada({ sent_at: null }))).toBeNull();
    expect(propostaVencida(enviada({ sent_at: null }), new Date("2027-01-01"))).toBe(false);
  });

  it("rascunho parado compara com o limite recebido", () => {
    const limite = Date.parse("2026-01-10T00:00:00Z");
    const p = { status: "rascunho", updated_at: "2026-01-05T00:00:00Z", validity_days: 15 };
    expect(rascunhoParado(p, limite)).toBe(true);
    expect(rascunhoParado({ ...p, updated_at: "2026-01-11T00:00:00Z" }, limite)).toBe(false);
    expect(rascunhoParado({ ...p, status: "enviada" }, limite)).toBe(false);
  });

  it("tag e data curta", () => {
    expect(tagProposta("abc")).toContain("abc");
    expect(ddmmProposta("2026-01-16")).toBe("16/01");
  });
});

describe("desfechos de proposta", () => {
  it("rascunho parado oferece recusar e excluir", () => {
    const tipos = desfechosParaTipo("proposta_rascunho_parada").map((d) => d.tipo);
    expect(tipos).toContain("recusar_proposta");
    expect(tipos).toContain("excluir_rascunho");
    expect(tipos).not.toContain("prorrogar_proposta");
  });

  it("proposta vencida oferece prorrogar e reemitir", () => {
    const tipos = desfechosParaTipo("proposta_vencida").map((d) => d.tipo);
    expect(tipos).toContain("prorrogar_proposta");
    expect(tipos).toContain("reemitir_proposta");
  });

  it("prorrogar exige data e motivo", () => {
    const ctx = { tipoTarefa: "proposta_vencida", temLead: true };
    expect(validarDesfecho({ tipo: "prorrogar_proposta" }, ctx).ok).toBe(false);
    const r = validarDesfecho(
      { tipo: "prorrogar_proposta", data: "2099-01-10", detalhe: "cliente pediu mais prazo" },
      ctx,
    );
    expect(r.ok).toBe(true);
  });

  it("excluir rascunho exige justificativa", () => {
    const ctx = { tipoTarefa: "proposta_rascunho_parada", temLead: true };
    expect(validarDesfecho({ tipo: "excluir_rascunho", detalhe: "x" }, ctx).ok).toBe(false);
    expect(
      validarDesfecho({ tipo: "excluir_rascunho", detalhe: "rascunho duplicado" }, ctx).ok,
    ).toBe(true);
  });

  it("desfecho de outro tipo é barrado (fail-closed)", () => {
    expect(
      validarDesfecho(
        { tipo: "prorrogar_proposta", data: "2099-01-10", detalhe: "motivo bom" },
        { tipoTarefa: "follow_up", temLead: true },
      ).ok,
    ).toBe(false);
  });

  it("carência das regras de proposta", () => {
    expect(carenciaHorasUteis("proposta_rascunho_parada")).toBe(30);
    expect(carenciaHorasUteis("proposta_vencida")).toBe(50);
  });
});
