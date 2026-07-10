import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista tarefas do vendedor logado (hoje + atrasadas), ordenadas por prioridade. */
export const listMinhaAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const endOfDay = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); })();

    const { data: tarefas, error } = await supabase
      .from("tarefas")
      .select("id, lead_id, tipo, title, descricao, prioridade, escalonamentos, hora_sugerida, due_date, status, origem, created_at")
      .eq("owner_id", userId)
      .in("status", ["pendente", "adiada"])
      .lte("due_date", endOfDay)
      .order("prioridade", { ascending: true })
      .order("due_date", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((tarefas ?? []).map((t: any) => t.lead_id).filter(Boolean)));
    let leadsById: Record<string, { company: string; stage: string; whatsapp: string | null }> = {};
    if (leadIds.length) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, company, stage, telefone_whatsapp")
        .in("id", leadIds);
      leadsById = Object.fromEntries((leads ?? []).map((l: any) => [l.id, {
        company: l.company, stage: l.stage, whatsapp: l.telefone_whatsapp,
      }]));
    }
    return (tarefas ?? []).map((t: any) => ({
      ...t,
      lead: t.lead_id ? leadsById[t.lead_id] ?? null : null,
    }));
  });

export const concluirTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    nota: z.string().trim().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Regra de negócio: pós-venda exige nota substancial (min 10 chars).
    // O trigger tg_tarefas_protect também bloqueia, mas validamos aqui para
    // devolver mensagem amigável antes do round-trip.
    const { data: tarefa, error: readErr } = await supabase
      .from("tarefas")
      .select("tipo, origem, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!tarefa) throw new Error("Tarefa não encontrada");
    if (tarefa.status === "concluida") return { ok: true };

    const isPosVenda = typeof tarefa.tipo === "string" && tarefa.tipo.startsWith("pos_venda_");
    const nota = data.nota?.trim() ?? "";
    if (isPosVenda && nota.length < 10) {
      throw new Error(
        "Tarefas de pós-venda exigem nota de conclusão com pelo menos 10 caracteres descrevendo o que o cliente disse.",
      );
    }

    const { error } = await supabase
      .from("tarefas")
      .update({
        status: "concluida",
        nota_conclusao: nota || null,
        concluida_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const adiarTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    motivo: z.string().min(1).max(500),
    novaData: z.string().min(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Lê escalonamentos atual
    const { data: cur } = await supabase.from("tarefas").select("escalonamentos").eq("id", data.id).maybeSingle();
    const { error } = await supabase
      .from("tarefas")
      .update({
        status: "adiada",
        motivo_adiamento: data.motivo,
        due_date: new Date(data.novaData).toISOString(),
        escalonamentos: ((cur?.escalonamentos as any) ?? 0) + 1,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
