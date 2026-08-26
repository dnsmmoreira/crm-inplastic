import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

type CalcInput = {
  originCep: string;
  destinationCep: string;
};

export const calculateFreightDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CalcInput) => {
    if (!input?.originCep || !input?.destinationCep) {
      throw new Error("CEPs de origem e destino são obrigatórios");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { computeFreightDistance } = await import("@/lib/freight.server");
    return computeFreightDistance(data.originCep, data.destinationCep);
  });
