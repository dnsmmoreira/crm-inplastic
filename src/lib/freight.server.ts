import { geocodeCep, googleMapsErrorMessage } from "@/lib/geocode.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export function getGoogleMapsConnectionKey() {
  // Server-side: prioriza a chave sem restrição de referrer.
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY_1;
}

export async function computeFreightDistance(originCep: string, destinationCep: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = getGoogleMapsConnectionKey();
  if (!lovableKey || !connKey) {
    throw new Error("Google Maps não está configurado no projeto");
  }

  const [origin, destination] = await Promise.all([
    geocodeCep(originCep, lovableKey, connKey),
    geocodeCep(destinationCep, lovableKey, connKey),
  ]);

  const routesRes = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
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
}
