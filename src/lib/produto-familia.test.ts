import { describe, expect, it } from "vitest";
import { familiaDoSku, inferirFamilia, rotuloFamilia } from "./produto-familia";

const FAMILIAS = [
  "ALC 6437",
  "CS 03",
  "CS 13",
  "CS 30",
  "CT IBC 1000L",
  "CT1 AT",
  "CT2 AT",
  "CT2 BX",
  "CT4 AT",
  "CT4 BX",
  "CX HTF 48",
  "CX HTF 49 RT",
  "ED2550",
  "ED5050",
  "ED8241",
  "EX1210",
  "EXLS",
  "HV3",
  "HV6",
  "IBC 1000",
  "LX 1000",
  "LX 240",
  "LX PED 100",
  "LX PED 15",
  "LX PED 25",
  "MDLS",
];

describe("familiaDoSku", () => {
  it("remove o sufixo de cor", () => {
    expect(familiaDoSku("ED5050 AZL")).toBe("ED5050");
    expect(familiaDoSku("CX HTF 49 RT BRC")).toBe("CX HTF 49 RT");
    expect(familiaDoSku("MDLS CNZ PRT")).toBe("MDLS");
    expect(familiaDoSku("IBC 1000")).toBe("IBC 1000");
    expect(familiaDoSku("CT IBC 1000L")).toBe("CT IBC 1000L");
    expect(familiaDoSku("EXLS 1210")).toBe("EXLS");
    expect(familiaDoSku(null)).toBe("");
  });
});

describe("rotuloFamilia", () => {
  it("devolve o nome sem a cor", () => {
    expect(
      rotuloFamilia([
        { name: "PALLET ESTRADO ED5050 AZUL", sku: "ED5050 AZL" },
        { name: "PALLET ESTRADO ED5050 BRANCO", sku: "ED5050 BRC" },
      ]),
    ).toBe("PALLET ESTRADO ED5050");
    expect(rotuloFamilia([{ name: "PALLET MDLS CINZA PRETO", sku: "MDLS CNZ PRT" }])).toBe(
      "PALLET MDLS",
    );
    expect(rotuloFamilia([{ name: "", sku: "HV6 AZL" }])).toBe("HV6");
  });
});

describe("inferirFamilia — textos reais dos leads", () => {
  const casos: [string, string | null][] = [
    ["Pallet HV6 1210", "HV6"],
    ["pallet HV6 1210", "HV6"],
    ["Pallet plástico HV6 1210 para 3000 kg em uso no solo", "HV6"],
    ["Pallet EX 1210", "EX1210"],
    ["EX 1210", "EX1210"],
    ["Pallet EXCL 1210", "EXLS"],
    ["pallets MD 1210", "MDLS"],
    ["MD 1210", "MDLS"],
    ["pallets MD 1210 e MDCL 1210", "MDLS"],
    ["Pallet plástico modelo HV3 1210, uso para latões", "HV3"],
    ["HV3 1210", "HV3"],
    ["Estrado 2550", "ED2550"],
    ["Estrado 5050 (50x50x5 cm) para piso; peso não crítico", "ED5050"],
    ["Pallet de contenção p/ 2 tambores 200L (foto enviada)", null],
    ["pallet de contenção", null],
    ["pallets", null],
    ["pallet plástico", null],
    ["sacos plásticos", null],
    ["balde de pipoca", null],
    ["tanque 1000L com tampa removível", null],
    ["Pallet HV5 ou HV6", null],
  ];
  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      expect(inferirFamilia(texto, FAMILIAS)).toBe(esperado);
    });
  }

  it("contenção com IBC vai para o pallet de contenção IBC", () => {
    expect(inferirFamilia("pallet de contenção para IBC 1000L", FAMILIAS)).toBe("CT IBC 1000L");
    expect(inferirFamilia("pallet IBC", FAMILIAS)).toBe("IBC 1000");
  });

  it("família fora do catálogo devolve null", () => {
    expect(inferirFamilia("Pallet HV5", FAMILIAS)).toBeNull();
    expect(inferirFamilia("Estrado 2525", FAMILIAS)).toBeNull();
  });

  it("texto vazio devolve null", () => {
    expect(inferirFamilia("", FAMILIAS)).toBeNull();
    expect(inferirFamilia(null, FAMILIAS)).toBeNull();
  });
});
