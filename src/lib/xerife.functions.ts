import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Somente administradores.");
}

export const getXerifeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("xerife_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const configSchema = z.object({
  dias_sem_interacao_por_etapa: z.record(z.string(), z.number()).optional(),
  proposta_enviada_dias: z.number().int().min(1).max(60).optional(),
  tarefa_atrasada_horas: z.number().int().min(1).max(720).optional(),
  ia_sem_resposta_horas: z.number().int().min(1).max(720).optional(),
  horario_comercial_inicio: z.string().optional(),
  horario_comercial_fim: z.string().optional(),
  resumo_diario_ativo: z.boolean().optional(),
  resumo_hora: z.string().optional(),
  ativo: z.boolean().optional(),
});

export const updateXerifeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("xerife_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAiActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        leadId: z.string().uuid().optional(),
        type: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("lead_ai_actions")
      .select("id, lead_id, owner_id, type, content, metadata, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((rows ?? []).map((r: any) => r.lead_id).filter(Boolean)));
    let leadsById: Record<string, { company: string }> = {};
    if (leadIds.length) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, company")
        .in("id", leadIds);
      leadsById = Object.fromEntries((leads ?? []).map((l: any) => [l.id, { company: l.company }]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      lead_company: r.lead_id ? leadsById[r.lead_id]?.company ?? null : null,
    }));
  });

/** Executa o Xerife agora (fora do horário/agendamento). Somente admin. */
export const runXerifeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runXerife } = await import("@/routes/api/public/hooks/xerife");
    return runXerife(true);
  });
