import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
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
    const { distanceKm } = await import("@/lib/logistica.server");
    const dist = await distanceKm(data.originCep, data.destinationCep);
    const calc = calcularLogistica(data.itens, data.frota, dist.km);
    return { ...calc, originAddress: dist.origin, destinationAddress: dist.destination };
  });
