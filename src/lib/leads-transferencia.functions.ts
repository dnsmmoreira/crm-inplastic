/**
 * Transferência de cliente (lead) entre responsáveis.
 *
 * Sempre pela RPC `transferir_lead` (SECURITY DEFINER): a policy de `leads`
 * não deixa um vendedor gravar `owner_id` de outra pessoa. A RPC valida quem
 * pode transferir, leva as tarefas abertas, registra histórico e avisa.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const transferirLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        leadId: z.string().uuid(),
        novoOwnerId: z.string().uuid(),
        motivo: z.string().trim().min(5, "Descreva o motivo com pelo menos 5 caracteres."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: destino, error: erroDestino } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("id", data.novoOwnerId)
      .maybeSingle();
    if (erroDestino) throw new Error(erroDestino.message);

    const { data: res, error } = await supabase.rpc("transferir_lead", {
      _lead_id: data.leadId,
      _novo_owner: data.novoOwnerId,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);

    const { notifyOwner } = await import("@/lib/xerife/notify.server");
    await notifyOwner(
      data.novoOwnerId,
      `↪️ *Cliente transferido*\n\nUm cliente passou a ser seu.\nMotivo: ${data.motivo}`,
    );

    const movidas = ((res as { tarefas_movidas?: number } | null)?.tarefas_movidas ?? 0) as number;
    return {
      ok: true as const,
      tarefasMovidas: movidas,
      para: (destino?.name as string) ?? "colega",
    };
  });

/**
 * Transferência da CARTEIRA de um cliente: leva o cliente, os atendimentos
 * abertos, as tarefas e as conversas para o novo responsável.
 * Sempre pela RPC `transferir_cliente` (SECURITY DEFINER) — a UI nunca grava
 * `clientes.vendedor_id` direto.
 */
export const transferirCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        clienteId: z.string().uuid(),
        novoOwnerId: z.string().uuid(),
        motivo: z.string().trim().min(5, "Descreva o motivo com pelo menos 5 caracteres."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: destino, error: erroDestino } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("id", data.novoOwnerId)
      .maybeSingle();
    if (erroDestino) throw new Error(erroDestino.message);

    const { data: res, error } = await supabase.rpc("transferir_cliente", {
      _cliente_id: data.clienteId,
      _novo_owner: data.novoOwnerId,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);

    const { notifyOwner } = await import("@/lib/xerife/notify.server");
    await notifyOwner(
      data.novoOwnerId,
      `↪️ *Carteira transferida*\n\nUm cliente passou a ser seu.\nMotivo: ${data.motivo}`,
    );

    const r = (res ?? {}) as {
      tarefas_movidas?: number;
      leads_movidos?: number;
      conversas_movidas?: number;
    };
    return {
      ok: true as const,
      tarefasMovidas: r.tarefas_movidas ?? 0,
      leadsMovidos: r.leads_movidos ?? 0,
      conversasMovidas: r.conversas_movidas ?? 0,
      para: (destino?.name as string) ?? "colega",
    };
  });
