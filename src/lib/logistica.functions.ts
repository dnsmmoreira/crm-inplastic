import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calcularLogistica,
  type CalcResultado,
  type FleetVehicle,
  type ItemProposta,
} from "@/lib/logistica";

type Input = {
  itens: ItemProposta[];
  frota: FleetVehicle[];
  originCep: string;
  destinationCep: string;
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

async function geocodeCep(cep: string, lovableKey: string, connKey: string) {
  const clean = cep.replace(/\D/g, "");
  const query = clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}, Brasil` : `${cep}, Brasil`;
  const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=br&language=pt-BR`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
  });
  if (!res.ok) throw new Error(`Geocode ${cep}: ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
  };
  if (data.status !== "OK" || !data.results?.length) throw new Error(`CEP não localizado: ${cep}`);
  const r = data.results[0];
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: r.formatted_address };
}

async function distanceKm(originCep: string, destCep: string): Promise<{ km: number; origin: string; destination: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !connKey) throw new Error("Google Maps não está configurado no projeto");
  const [origin, destination] = await Promise.all([
    geocodeCep(originCep, lovableKey, connKey),
    geocodeCep(destCep, lovableKey, connKey),
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
  if (!routesRes.ok) throw new Error(`Routes API falhou: ${routesRes.status} ${await routesRes.text()}`);
  const routesData = (await routesRes.json()) as { routes?: Array<{ distanceMeters?: number }> };
  const meters = routesData.routes?.[0]?.distanceMeters;
  if (!meters) throw new Error("Nenhuma rota rodoviária encontrada entre os CEPs.");
  return { km: +(meters / 1000).toFixed(1), origin: origin.address, destination: destination.address };
}

export const cotarLogistica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input?.itens?.length) throw new Error("Informe ao menos um item.");
    if (!input.frota?.length) throw new Error("Frota vazia — cadastre veículos primeiro.");
    if (!input.originCep || !input.destinationCep)
      throw new Error("CEPs de origem e destino obrigatórios.");
    return input;
  })
  .handler(async ({ data }): Promise<CalcResultado & { originAddress: string; destinationAddress: string }> => {
    const dist = await distanceKm(data.originCep, data.destinationCep);
    const calc = calcularLogistica(data.itens, data.frota, dist.km);
    return { ...calc, originAddress: dist.origin, destinationAddress: dist.destination };
  });
