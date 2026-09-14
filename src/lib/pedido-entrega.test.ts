import { describe, it, expect } from "vitest";
import { derivarEntregaDaProposta } from "@/lib/pedido-entrega";
import { podeEditarComercialPedido, ehCampoComercialPedido } from "@/lib/pedidos-papeis";
import { dadosExigidosParaEntrar, entregaDefinida } from "@/lib/pedido-avanco";

describe("derivarEntregaDaProposta", () => {
  it("retirada (Cliente retira) vira entrega própria sem transportadora", () => {
    expect(derivarEntregaDaProposta({ carrier: "Cliente retira" })).toEqual({
      modalidade_entrega: "entrega_propria",
      transportadora: null,
      transportadoraId: null,
    });
  });

  it("veículo próprio também é entrega própria", () => {
    const r = derivarEntregaDaProposta({ carrier: "Veículo próprio" });
    expect(r.modalidade_entrega).toBe("entrega_propria");
    expect(r.transportadora).toBeNull();
  });

  it("transportadora definida vira coleta com o nome dela", () => {
    expect(derivarEntregaDaProposta({ carrier: "Braspress" })).toMatchObject({
      modalidade_entrega: "coleta",
      transportadora: "Braspress",
    });
  });

  it("só o id da transportadora ainda é coleta", () => {
    const r = derivarEntregaDaProposta({ carrierTransportadoraId: "abc" });
    expect(r.modalidade_entrega).toBe("coleta");
    expect(r.transportadoraId).toBe("abc");
  });

  it("sem nenhuma informação não inventa nada", () => {
    expect(derivarEntregaDaProposta(null)).toEqual({
      modalidade_entrega: null,
      transportadora: null,
      transportadoraId: null,
    });
  });
});

describe("papéis do pedido", () => {
  it("admin e vendedor dono editam a tratativa comercial", () => {
    expect(podeEditarComercialPedido({ isAdmin: true, isVendedorDono: false })).toBe(true);
    expect(podeEditarComercialPedido({ isAdmin: false, isVendedorDono: true })).toBe(true);
  });

  it("operacional (nem admin nem dono) não edita", () => {
    expect(podeEditarComercialPedido({ isAdmin: false, isVendedorDono: false })).toBe(false);
  });

  it("classifica os campos comerciais", () => {
    expect(ehCampoComercialPedido("transportadora")).toBe(true);
    expect(ehCampoComercialPedido("modalidade_entrega")).toBe(true);
    expect(ehCampoComercialPedido("previsao_entrega")).toBe(false);
    expect(ehCampoComercialPedido("nf_numero")).toBe(false);
  });
});

describe("entrada em Coleta / Entrega", () => {
  it("não pede mais modalidade nem transportadora ao operacional", () => {
    expect(dadosExigidosParaEntrar("pronto")).toEqual([]);
  });

  it("pedido com entrega própria ou transportadora está definido", () => {
    expect(entregaDefinida({ modalidade_entrega: "entrega_propria", transportadora: null })).toBe(
      true,
    );
    expect(entregaDefinida({ modalidade_entrega: "coleta", transportadora: "Braspress" })).toBe(
      true,
    );
  });

  it("pedido legado sem dado nenhum é barrado", () => {
    expect(entregaDefinida({ modalidade_entrega: null, transportadora: null })).toBe(false);
  });
});
