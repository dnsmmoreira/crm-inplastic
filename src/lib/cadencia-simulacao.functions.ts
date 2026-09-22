import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertRpcPermissao } from "@/lib/guard-erros";
import type { PedidoOpcao, SimResultado } from "@/lib/cadencia-simulacao.types";

const CHAVE_SIMULADOR = "agente_ia.editar_prompt";
const MSG_SEM_PERMISSAO = "Você não tem permissão para usar o simulador de cadência.";

/** Fail-closed: mesma permissão exigida pela rota /cadencia-simulador. */
async function exigirPermissaoSimulador(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const permitido = await assertRpcPermissao(
    await supabase.rpc("tem_permissao", { _user_id: userId, _chave: CHAVE_SIMULADOR }),
    "cadencia-simulacao/tem_permissao",
    { userId, chave: CHAVE_SIMULADOR },
  );
  if (permitido !== true) throw new Error(MSG_SEM_PERMISSAO);
}

export const listPedidosSimulaveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PedidoOpcao[]> => {
    await exigirPermissaoSimulador(context.supabase, context.userId);
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
    await exigirPermissaoSimulador(context.supabase, context.userId);
    const { simularCadencia } = await import("@/lib/cadencia-simulacao.server");
    return simularCadencia(context.supabase, data);
  });
