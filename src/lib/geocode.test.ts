import { describe, expect, it, vi, afterEach } from "vitest";
import { geocodeCep, resultadoAmploDemais, isGeocodeError } from "@/lib/geocode.server";

const centroidePais = {
  status: "OK",
  results: [
    {
      formatted_address: "Brasil",
      partial_match: true,
      types: ["country", "political"],
      geometry: { location: { lat: -14.235, lng: -51.925 } },
    },
  ],
};

const enderecoReal = (address: string, lat: number, lng: number) => ({
  status: "OK",
  results: [
    {
      formatted_address: address,
      types: ["street_address"],
      geometry: { location: { lat, lng } },
    },
  ],
});

function mockFetchSequence(handlers: Array<(url: string) => unknown>) {
  let i = 0;
  const fn = vi.fn(async (url: string) => {
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    const body = handler(String(url));
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resultadoAmploDemais", () => {
  it("rejeita centroide de país", () => {
    expect(resultadoAmploDemais(centroidePais.results[0])).toBe(true);
  });
  it("rejeita centroide de estado", () => {
    expect(
      resultadoAmploDemais({
        formatted_address: "Bahia, Brasil",
        types: ["administrative_area_level_1", "political"],
        geometry: { location: { lat: 0, lng: 0 } },
      }),
    ).toBe(true);
  });
  it("aceita endereço real", () => {
    expect(resultadoAmploDemais(enderecoReal("Rua X", 1, 2).results[0])).toBe(false);
  });
});

describe("geocodeCep", () => {
  it("cai no fallback do ViaCEP quando o Google devolve o centroide do país", async () => {
    const fetchMock = mockFetchSequence([
      () => centroidePais, // geocode do CEP
      () => ({ cep: "44864-260", logradouro: "Av. Edvaldo Santos Lopes", bairro: "Fórum", localidade: "Irecê", uf: "BA" }),
      () => enderecoReal("Av. Edvaldo Santos Lopes, Irecê - BA", -11.3, -41.85),
    ]);

    const r = await geocodeCep("44864260", "lk", "ck");
    expect(r.lat).toBeCloseTo(-11.3);
    expect(r.address).toContain("Irecê");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[1]).toContain("viacep.com.br");
    expect(urls[2]).toContain("Irec");
  });

  it("cai para cidade - UF quando o endereço completo também é amplo demais", async () => {
    mockFetchSequence([
      () => centroidePais,
      () => ({ logradouro: "", bairro: "", localidade: "Iaras", uf: "SP" }),
      () => centroidePais,
      () => enderecoReal("Iaras - SP, Brasil", -22.87, -49.17),
    ]);
    const r = await geocodeCep("18775023", "lk", "ck");
    expect(r.address).toContain("Iaras");
  });

  it("lança erro de geocode (não de rota) quando nada resolve", async () => {
    mockFetchSequence([
      () => centroidePais,
      () => ({ erro: true }),
    ]);
    await expect(geocodeCep("00000000", "lk", "ck")).rejects.toSatisfy((e: unknown) => {
      return isGeocodeError(e) && /preencha o valor do frete manualmente/i.test((e as Error).message);
    });
  });

  it("aceita direto um resultado bom sem chamar o ViaCEP", async () => {
    const fetchMock = mockFetchSequence([() => enderecoReal("Rua Capitão Busse, 854", -23.5, -46.6)]);
    const r = await geocodeCep("02232050", "lk", "ck");
    expect(r.address).toContain("Capitão Busse");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
