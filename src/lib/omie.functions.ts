import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fluxo interno de fechamento de pedido — sem integração externa.
 * O nome do arquivo é mantido por compatibilidade com imports existentes.
 *
 * `gerarPedidoOmie` (legado, apenas o nome):
 *   - Marca a proposta como `status='pedido'` (idempotente).
 *   - Move o lead para `stage='ganho'` automaticamente.
 *   - Retorna `{ ok, validacao_erros? }` — sem chamadas externas.
 *
 * `moverParaGanhoOmie`:
 *   - Gate do kanban: só permite mover pra ganho se houver proposta com `status='pedido'`.
 */

export type OmieResult = {
  ok: boolean;
  validacao_erros?: string[];
  proposta_id?: string;
};

export type MoverParaGanhoOmieResult = OmieResult;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;
function relaxSupabase(sb: unknown): LooseClient {
  return sb as LooseClient;
}

export const gerarPedidoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposta_id: string; requer_aprovacao?: boolean }) =>
    z
      .object({
        proposta_id: z.string().uuid(),
        requer_aprovacao: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const { supabase, userId } = context;
    const loose: LooseClient = relaxSupabase(supabase);
    const propostaId = data.proposta_id;

    const { data: proposta, error: propErr } = await loose
      .from("propostas")
      .select("id, status, lead_id")
      .eq("id", propostaId)
      .maybeSingle();
    if (propErr) throw new Error(`Falha ao carregar proposta: ${propErr.message}`);
    if (!proposta) throw new Error("Proposta não encontrada");

    const leadId = proposta.lead_id as string | null;
    if (!leadId) {
      return {
        ok: false,
        proposta_id: propostaId,
        validacao_erros: ["Proposta sem lead vinculado."],
      };
    }

    // Valida itens mínimos
    const { data: itens, error: itErr } = await loose
      .from("proposta_itens")
      .select("id, quantity, unit_price")
      .eq("proposta_id", propostaId);
    if (itErr) throw new Error(`Falha ao carregar itens: ${itErr.message}`);
    const erros: string[] = [];
    if (!itens || itens.length === 0) {
      erros.push("Adicione pelo menos 1 item à proposta antes de gerar o pedido.");
    } else if (itens.some((i: { unit_price: number }) => Number(i.unit_price) <= 0)) {
      erros.push("Todos os itens precisam de valor unitário maior que zero.");
    }
    if (erros.length > 0) {
      return { ok: false, validacao_erros: erros, proposta_id: propostaId };
    }

    // Fluxo de aprovação (mantém o gate existente).
    if (proposta.status !== "pedido") {
      if (data.requer_aprovacao) {
        await loose
          .from("propostas")
          .update({
            status: "aguardando_aprovacao",
            approval_requested_at: new Date().toISOString(),
            approval_reason: "Geração de pedido requer autorização do supervisor",
          })
          .eq("id", propostaId);
        return {
          ok: false,
          proposta_id: propostaId,
          validacao_erros: ["Aguardando liberação do supervisor para gerar pedido."],
        };
      }

      const nowIso = new Date().toISOString();
      await loose
        .from("propostas")
        .update({
          status: "pedido",
          approved_by_user_id: userId,
          approved_at: nowIso,
          order_created_at: nowIso,
        })
        .eq("id", propostaId);
    }

    // Move o lead para ganho automaticamente.
    await loose.from("leads").update({ stage: "ganho" }).eq("id", leadId);

    return { ok: true, proposta_id: propostaId };
  });

export const moverParaGanhoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const loose: LooseClient = relaxSupabase(context.supabase);
    const { data: prop, error } = await loose
      .from("propostas")
      .select("id")
      .eq("lead_id", data.lead_id)
      .eq("status", "pedido")
      .order("order_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar proposta: ${error.message}`);
    if (!prop) {
      return {
        ok: false,
        validacao_erros: [
          "Gere o pedido em uma proposta antes de mover para Ganho.",
        ],
      };
    }
    await loose.from("leads").update({ stage: "ganho" }).eq("id", data.lead_id);
    return { ok: true, proposta_id: prop.id as string };
  });
