/**
 * Etapa e reagendamento do lead — caminho ÚNICO de servidor.
 *
 * Motivo (incidente 04/09): a etapa ia junto no salvamento genérico do lead;
 * uma aba com cópia velha reenviava `stage` antigo e desfazia o fechamento
 * (lead "Ricardo…" voltou de ganho para proposta 51 min depois). Agora a etapa
 * só muda pela RPC `mover_etapa_lead` (SECURITY DEFINER, valida dono/gestor/
 * admin e registra a origem no histórico) e a trava `trg_leads_stage_lock`
 * recusa qualquer gravação genérica que tente tirar o lead de ganho/perdido.
 *
 * O reagendamento (`next_followup`) segue o mesmo desenho: é o "silenciar o
 * Xerife até tal dia", e por isso nunca pode ser apagado por um save antigo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

const STAGES = [
  "atendimento",
  "novo",
  "qualificacao",
  "proposta",
  "negociacao",
  "ganho",
  "perdido",
] as const;

export const moverEtapaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        leadId: z.string().uuid(),
        stage: z.enum(STAGES),
        origem: z.string().trim().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("mover_etapa_lead", {
      _lead_id: data.leadId,
      _stage: data.stage,
      _origem: data.origem ?? "tela",
    });
    if (error) throw new Error(error.message);
    const r = (res ?? {}) as { stage_anterior?: string; alterado?: boolean };
    return {
      ok: true as const,
      stage: data.stage,
      stageAnterior: r.stage_anterior ?? null,
      alterado: r.alterado !== false,
    };
  });

export const reagendarLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        leadId: z.string().uuid(),
        /** ISO da data/hora do próximo contato; `null` limpa o reagendamento. */
        quando: z.string().datetime().nullable(),
        motivo: z.string().trim().max(280).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reagendar_lead", {
      _lead_id: data.leadId,
      _quando: data.quando as unknown as string,
      _motivo: (data.motivo ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, quando: data.quando };
  });
