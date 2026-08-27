import { describe, expect, it } from "vitest";
import {
  escolherServiceType,
  formatarDistanciaLalamove,
  formatarValorLalamove,
  parseQuotation,
  servicosDeSaoPaulo,
  ufAceitaLalamove,
} from "./lalamove";

describe("ufAceitaLalamove", () => {
  it("só aceita SP", () => {
    expect(ufAceitaLalamove("SP")).toBe(true);
    expect(ufAceitaLalamove(" sp ")).toBe(true);
    expect(ufAceitaLalamove("RJ")).toBe(false);
    expect(ufAceitaLalamove("São Paulo")).toBe(false);
    expect(ufAceitaLalamove(null)).toBe(false);
    expect(ufAceitaLalamove(undefined)).toBe(false);
  });
});

describe("formatação", () => {
  it("formata valor e distância, com placeholder pra vazio", () => {
    expect(formatarValorLalamove(123.4)).toContain("123,40");
    expect(formatarValorLalamove(null)).toBe("—");
    expect(formatarDistanciaLalamove(12.34)).toBe("12,3 km");
    expect(formatarDistanciaLalamove(null)).toBe("—");
  });
});

describe("serviceType", () => {
  const cities = [
    { locode: "BR RIO", name: "Rio de Janeiro", services: [{ key: "MOTORCYCLE" }] },
    { locode: "BR SAO", name: "São Paulo", services: [{ key: "MOTORCYCLE" }, { key: "VAN" }] },
  ];

  it("pega os serviços da cidade de São Paulo", () => {
    expect(servicosDeSaoPaulo(cities).map((s) => s.key)).toEqual(["MOTORCYCLE", "VAN"]);
  });

  it("prefere veículo utilitário a moto", () => {
    expect(escolherServiceType(servicosDeSaoPaulo(cities))).toBe("VAN");
  });

  it("cai no primeiro serviço quando nenhum da preferência existe", () => {
    expect(escolherServiceType([{ key: "EXOTIC" }])).toBe("EXOTIC");
  });

  it("retorna null sem serviços", () => {
    expect(escolherServiceType([])).toBeNull();
    expect(servicosDeSaoPaulo(null)).toEqual([]);
  });
});

describe("parseQuotation", () => {
  it("faz o parsing da resposta real da API", () => {
    const r = parseQuotation(
      {
        data: {
          quotationId: "q-123",
          serviceType: "VAN",
          expiresAt: "2026-08-27T12:00:00Z",
          priceBreakdown: { total: "89.9", currency: "BRL" },
          distance: { value: "12500", unit: "m" },
        },
      },
      "VAN",
    );
    expect(r).toEqual({
      valor: 89.9,
      distanciaKm: 12.5,
      serviceType: "VAN",
      quotationId: "q-123",
      expiraEm: "2026-08-27T12:00:00Z",
    });
  });

  it("aceita distância já em km e ausência de expiração", () => {
    const r = parseQuotation(
      { data: { quotationId: "q", priceBreakdown: { total: 10 }, distance: { value: "8", unit: "km" } } },
      "CAR",
    );
    expect(r.distanciaKm).toBe(8);
    expect(r.expiraEm).toBeNull();
    expect(r.serviceType).toBe("CAR");
  });

  it("tolera resposta sem distância", () => {
    const r = parseQuotation({ data: { quotationId: "q", priceBreakdown: { total: "5.5" } } }, "CAR");
    expect(r.distanciaKm).toBeNull();
  });

  it("falha claramente sem preço ou sem dados", () => {
    expect(() => parseQuotation({ data: { quotationId: "q" } }, "CAR")).toThrow(/preço/i);
    expect(() => parseQuotation({}, "CAR")).toThrow(/cotação/i);
  });
});
