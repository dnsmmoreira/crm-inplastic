import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { LALAMOVE_ERRO_UF, ufAceitaLalamove, type LalamoveCotacao } from "@/lib/lalamove";

type CotarInput = {
  originCep: string;
  destinationCep: string;
  ufCliente: string | null;
};

export const cotarFreteLalamove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CotarInput) => {
    if (!input?.originCep || !input?.destinationCep) {
      throw new Error("CEPs de origem e destino são obrigatórios");
    }
    if (!ufAceitaLalamove(input.ufCliente)) throw new Error(LALAMOVE_ERRO_UF);
    return input;
  })
  .handler(async ({ data }): Promise<LalamoveCotacao> => {
    const { cotarLalamove } = await import("@/lib/lalamove.server");
    return cotarLalamove(data);
  });
