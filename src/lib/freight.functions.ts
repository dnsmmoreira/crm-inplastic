import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function getGoogleMapsConnectionKey() {
  return process.env.GOOGLE_MAPS_API_KEY_1 ?? process.env.GOOGLE_MAPS_API_KEY;
}

async function googleMapsErrorMessage(response: Response, fallback: string) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { details?: Array<{ reason?: string; metadata?: { apiName?: string } }> } };
    const details = parsed.error?.details ?? [];
    const reason = details.find((detail) => detail.reason)?.reason;
    if (response.status === 403 && reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      return 'Google Maps: a chave server-side está restrita por HTTP referrer. No Google Cloud, deixe a chave server-side sem restrição de referrer (ou restrita por IP).';
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

type CalcInput = {
  originCep: string;
  destinationCep: string;
};

async function geocodeCep(cep: string, lovableKey: string, connKey: string) {
  const clean = cep.replace(/\D/g, "");
  const query = clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}, Brasil` : `${cep}, Brasil`;
  const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=br&language=pt-BR`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
  });
  if (!res.ok) throw new Error(await googleMapsErrorMessage(res, `Geocode ${cep}`));
  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`CEP não localizado: ${cep}`);
  }
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address,
  };
}

export const calculateFreightDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CalcInput) => {
    if (!input?.originCep || !input?.destinationCep) {
      throw new Error("CEPs de origem e destino são obrigatórios");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = getGoogleMapsConnectionKey();
    if (!lovableKey || !connKey) {
      throw new Error("Google Maps não está configurado no projeto");
    }

    const [origin, destination] = await Promise.all([
      geocodeCep(data.originCep, lovableKey, connKey),
      geocodeCep(data.destinationCep, lovableKey, connKey),
    ]);

    // Routes API — computeRoutes (rodoviário)
    const routesUrl = `${GATEWAY}/routes/directions/v2:computeRoutes`;
    const routesRes = await fetch(routesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
    if (!routesRes.ok) {
      throw new Error(await googleMapsErrorMessage(routesRes, "Routes API falhou"));
    }
    const routesData = (await routesRes.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string }>;
    };
    const route = routesData.routes?.[0];
    if (!route?.distanceMeters) {
      throw new Error("Nenhuma rota rodoviária encontrada entre os CEPs.");
    }

    return {
      distanceKm: +(route.distanceMeters / 1000).toFixed(1),
      durationSeconds: route.duration ? Number(String(route.duration).replace("s", "")) : null,
      originAddress: origin.address,
      destinationAddress: destination.address,
    };
  });
