import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateFreightDistance } from "@/lib/freight.functions";
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

/**
 * Orquestra distância (Google Maps via freight.functions) + cálculo puro.
 * Mantida como server fn autenticada para reaproveitar o mesmo quota control
 * do freight que já existe.
 */
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
    const dist = await calculateFreightDistance({
      data: { originCep: data.originCep, destinationCep: data.destinationCep },
    });
    const calc = calcularLogistica(data.itens, data.frota, dist.distanceKm);
    return {
      ...calc,
      originAddress: dist.originAddress,
      destinationAddress: dist.destinationAddress,
    };
  });
