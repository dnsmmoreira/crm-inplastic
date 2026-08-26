const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export class GeocodeError extends Error {
  readonly isGeocodeError = true;
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

export function isGeocodeError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { isGeocodeError?: boolean }).isGeocodeError);
}

export type GeocodeResult = {
  formatted_address: string;
  partial_match?: boolean;
  types?: string[];
  geometry: { location: { lat: number; lng: number } };
};

const TIPOS_AMPLOS_DEMAIS = new Set(["country", "administrative_area_level_1"]);

/**
 * O Google às vezes responde status OK para um CEP que não conhece,
 * devolvendo o centroide do país/estado. Esse resultado é inútil para rota.
 */
export function resultadoAmploDemais(result: GeocodeResult | undefined | null): boolean {
  if (!result) return true;
  const types = result.types ?? [];
  return types.some((t) => TIPOS_AMPLOS_DEMAIS.has(t));
}

export async function googleMapsErrorMessage(response: Response, fallback: string) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: Array<{ reason?: string; metadata?: { apiName?: string } }> };
    };
    const details = parsed.error?.details ?? [];
    const reason = details.find((detail) => detail.reason)?.reason;
    if (response.status === 403 && reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      return "Google Maps: a chave server-side está restrita por HTTP referrer. No Google Cloud, deixe a chave server-side sem restrição de referrer (ou restrita por IP).";
    }
    if (response.status === 403 && reason === "API_KEY_SERVICE_BLOCKED") {
      const apiName = details.find((detail) => detail.metadata?.apiName)?.metadata?.apiName;
      return `Google Maps: a chave server-side não permite esta API${apiName ? ` (${apiName})` : ""}. Adicione a API nas restrições da chave.`;
    }
  } catch {
    // Keep provider body below for unexpected non-JSON errors.
  }
  return `${fallback}: ${response.status}${body ? ` ${body}` : ""}`;
}

async function geocodeAddress(
  address: string,
  lovableKey: string,
  connKey: string,
  label: string,
): Promise<GeocodeResult | null> {
  const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br&language=pt-BR`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
  });
  if (!res.ok) throw new Error(await googleMapsErrorMessage(res, `Geocode ${label}`));
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: GeocodeResult[];
  };
  if (data.status === "REQUEST_DENIED") {
    throw new Error(
      `Google Maps recusou a chave server-side (${data.error_message ?? "REQUEST_DENIED"}). Verifique restrições da API key no Google Cloud.`,
    );
  }
  if (data.status === "OVER_QUERY_LIMIT") {
    throw new Error("Google Maps: cota excedida. Tente novamente em alguns minutos.");
  }
  if (data.status !== "OK" || !data.results?.length) return null;
  return data.results[0];
}

type ViaCep = {
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

async function consultarViaCep(cepLimpo: string): Promise<ViaCep | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCep;
    if (!data || data.erro || !data.localidade || !data.uf) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Geocodifica um CEP brasileiro rejeitando resultados amplos demais
 * (centroide de país/estado) e caindo para o endereço completo do ViaCEP.
 */
export async function geocodeCep(cep: string, lovableKey: string, connKey: string) {
  const clean = cep.replace(/\D/g, "");
  const cepFormatado = clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : cep;

  let result = await geocodeAddress(`${cepFormatado}, Brasil`, lovableKey, connKey, cep);

  if (!result || resultadoAmploDemais(result)) {
    const via = clean.length === 8 ? await consultarViaCep(clean) : null;
    if (via) {
      const partes = [via.logradouro, via.bairro, `${via.localidade} - ${via.uf}`, "Brasil"].filter(
        (p) => p && String(p).trim().length > 0,
      );
      const completo = await geocodeAddress(partes.join(", "), lovableKey, connKey, cep);
      if (completo && !resultadoAmploDemais(completo)) {
        result = completo;
      } else {
        const cidade = await geocodeAddress(
          `${via.localidade} - ${via.uf}, Brasil`,
          lovableKey,
          connKey,
          cep,
        );
        result = cidade && !resultadoAmploDemais(cidade) ? cidade : null;
      }
    } else {
      result = null;
    }
  }

  if (!result) {
    throw new GeocodeError(
      `Não foi possível localizar o CEP ${cepFormatado} — preencha o valor do frete manualmente.`,
    );
  }

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    address: result.formatted_address,
  };
}
