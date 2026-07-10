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

const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "hora inválida (HH:MM)");
const diasEtapaSchema = z
  .record(z.string(), z.number().int().min(1).max(90))
  .refine(
    (v) =>
      Object.keys(v).every((k) =>
        ["novo", "qualificacao", "proposta", "negociacao", "atendimento"].includes(k),
      ),
    { message: "etapa inválida" },
  );

const configSchema = z
  .object({
    // SLAs
    sla_primeiro_contato_min: z.number().int().min(1).max(240).optional(),
    sla_primeiro_contato_escalar_min: z.number().int().min(1).max(480).optional(),
    sla_resposta_whatsapp_horas: z.number().int().min(1).max(72).optional(),
    sla_resposta_whatsapp_escalar_horas: z.number().int().min(1).max(168).optional(),
    tarefa_atrasada_horas: z.number().int().min(1).max(720).optional(),
    ia_sem_resposta_horas: z.number().int().min(1).max(720).optional(),

    // Cadência
    dias_sem_interacao_por_etapa: diasEtapaSchema.optional(),
    max_dias_etapa: diasEtapaSchema.optional(),
    cadencia_proposta_dias: z.array(z.number().int().min(1).max(90)).min(1).max(10).optional(),
    proposta_enviada_dias: z.number().int().min(1).max(60).optional(),

    // Carteira
    carteira_alerta_dias: z.number().int().min(1).max(365).optional(),
    carteira_critico_dias: z.number().int().min(1).max(365).optional(),
    reciclagem_perdidos_dias: z.number().int().min(1).max(365).optional(),

    // Pós-venda
    pos_venda_dias: z.array(z.number().int().min(1).max(365)).min(1).max(10).optional(),

    // Agenda
    meta_atividades_dia: z.number().int().min(1).max(100).optional(),
    dias_uteis_inicio: timeStr.optional(),
    dias_uteis_fim: timeStr.optional(),
    horario_comercial_inicio: timeStr.optional(),
    horario_comercial_fim: timeStr.optional(),
    resumo_diario_ativo: z.boolean().optional(),
    resumo_hora: timeStr.optional(),

    // Motor
    ativo: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.sla_primeiro_contato_escalar_min == null ||
      d.sla_primeiro_contato_min == null ||
      d.sla_primeiro_contato_escalar_min > d.sla_primeiro_contato_min,
    { message: "Escalonar deve ser > SLA de 1º contato", path: ["sla_primeiro_contato_escalar_min"] },
  )
  .refine(
    (d) =>
      d.sla_resposta_whatsapp_escalar_horas == null ||
      d.sla_resposta_whatsapp_horas == null ||
      d.sla_resposta_whatsapp_escalar_horas > d.sla_resposta_whatsapp_horas,
    { message: "Escalonar deve ser > SLA de resposta", path: ["sla_resposta_whatsapp_escalar_horas"] },
  )
  .refine(
    (d) =>
      d.carteira_critico_dias == null ||
      d.carteira_alerta_dias == null ||
      d.carteira_critico_dias > d.carteira_alerta_dias,
    { message: "Crítico deve ser > alerta", path: ["carteira_critico_dias"] },
  )
  .refine(
    (d) =>
      d.cadencia_proposta_dias == null ||
      d.cadencia_proposta_dias.every((n, i, a) => i === 0 || n > a[i - 1]!),
    { message: "Cadência deve ser crescente", path: ["cadencia_proposta_dias"] },
  )
  .refine(
    (d) =>
      d.pos_venda_dias == null ||
      d.pos_venda_dias.every((n, i, a) => i === 0 || n > a[i - 1]!),
    { message: "Pós-venda deve ser crescente", path: ["pos_venda_dias"] },
  )
  .refine(
    (d) =>
      !d.dias_uteis_inicio || !d.dias_uteis_fim || d.dias_uteis_inicio < d.dias_uteis_fim,
    { message: "Início deve ser antes do fim", path: ["dias_uteis_fim"] },
  )
  .refine(
    (d) =>
      !d.horario_comercial_inicio ||
      !d.horario_comercial_fim ||
      d.horario_comercial_inicio < d.horario_comercial_fim,
    { message: "Início deve ser antes do fim", path: ["horario_comercial_fim"] },
  );

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
        type: z.enum(["followup", "schedule", "qualify", "reply", "alerta", "resumo"]).optional(),
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

/** Dispara o Resumo Diário via WhatsApp agora. Somente admin. */
export const runResumoDiarioNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runResumoDiario } = await import("@/routes/api/public/hooks/xerife");
    return runResumoDiario(true);
  });

/** Executa o novo Xerife Engine (Fase 2, cadência completa). Somente admin. */
export const runXerifeEngineNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runXerifeEngine } = await import("@/routes/api/public/hooks/xerife-engine");
    return runXerifeEngine({ force: true });
  });

/** Simula o Xerife Engine com a configuração atual, sem gravar nada. Somente admin. */
export const simulateXerifeEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runXerifeEngine } = await import("@/routes/api/public/hooks/xerife-engine");
    return runXerifeEngine({ force: true, dryRun: true });
  });

/** Dispara Agenda Diária agora (07:30). Somente admin. */
export const runAgendaDiariaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runAgendaDiaria } = await import("@/routes/api/public/hooks/xerife-agenda-diaria");
    return runAgendaDiaria(true);
  });

/** Dispara Checkpoint agora (13:00). Somente admin. */
export const runCheckpointNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runCheckpoint } = await import("@/routes/api/public/hooks/xerife-checkpoint");
    return runCheckpoint(true);
  });

/** Dispara Fechamento agora (18:00). Somente admin. */
export const runFechamentoNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runFechamento } = await import("@/routes/api/public/hooks/xerife-fechamento");
    return runFechamento(true);
  });
