import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import type { PedidoOpcao, SimResultado } from "@/lib/cadencia-simulacao.types";

export const listPedidosSimulaveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PedidoOpcao[]> => {
    const { listarPedidosSimulaveis } = await import("@/lib/cadencia-simulacao.server");
    return listarPedidosSimulaveis(context.supabase);
  });

export const simularCadenciaPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pedidoId: z.string().uuid(),
        diasSimulados: z.number().int().min(0).max(365).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SimResultado> => {
    const { simularCadencia } = await import("@/lib/cadencia-simulacao.server");
    return simularCadencia(context.supabase, data);
  });
