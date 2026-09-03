import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import {
  DETALHE_MIN_CHARS,
  DETALHE_OBRIGATORIO_MSG,
  MOTIVOS_PERDA,
  ordemMotivo,
  recontatoDias,
  type MotivoPerda,
} from "@/lib/motivos-perda";

export type PerdaRegistro = {
  lead_id: string;
  motivo: string | null;
  detalhe: string | null;
  perdido_em: string | null;
  recontatar_em: string | null;
};

export type MotivoPerdaAgregado = {
  motivo: string;
  total: number;
  valor_perdido: number;
};

/** Qualquer valor fora da lista canônica é recusado. */
export const perdaSchema = z.object({
  leadId: z.string().min(1, "leadId obrigatório"),
  motivo: z.enum(MOTIVOS_PERDA),
  observacao: z
    .string()
    .trim()
    .min(DETALHE_MIN_CHARS, DETALHE_OBRIGATORIO_MSG),
  recontatarEmDias: z.number().int().nullable().optional(),
});

/**
 * Grava o motivo da perda em colunas próprias (`leads.motivo_perda`,
 * `motivo_perda_detalhe`, `perdido_em`, `recontatar_em`). A nota de texto
 * continua sendo escrita pelo hook — aqui fica o dado estruturado, que
 * alimenta relatório e fila de recontato.
 */
export const registrarPerdaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => perdaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const motivo = data.motivo as MotivoPerda;
    const dias =
      data.recontatarEmDias !== undefined
        ? data.recontatarEmDias
        : recontatoDias(motivo);
    const recontatar =
      dias === null || dias === undefined
        ? null
        : new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

    const { error } = await supabase
      .from("leads")
      .update({
        motivo_perda: motivo,
        motivo_perda_detalhe: data.observacao.trim(),
        perdido_em: new Date().toISOString(),
        recontatar_em: recontatar,
      })
      .eq("id", data.leadId);

    if (error) throw new Error(error.message);
    return { ok: true, recontatar_em: recontatar };
  });


/** Motivos estruturados dos leads visíveis (para exibir na tela de Leads). */
export const listPerdasEstruturadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PerdaRegistro[]> => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, motivo_perda, motivo_perda_detalhe, perdido_em, recontatar_em")
      .not("motivo_perda", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      lead_id: r.id,
      motivo: r.motivo_perda,
      detalhe: r.motivo_perda_detalhe,
      perdido_em: r.perdido_em,
      recontatar_em: r.recontatar_em,
    }));
  });

/** Relatório "por que perdemos": agrupamento por motivo, com valor estimado. */
export const relatorioMotivosPerda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MotivoPerdaAgregado[]> => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("motivo_perda, estimated_value")
      .eq("stage", "perdido")
      .limit(5000);
    if (error) throw new Error(error.message);

    const map = new Map<string, MotivoPerdaAgregado>();
    for (const r of data ?? []) {
      const motivo = r.motivo_perda?.trim() || "Não informado";
      const cur = map.get(motivo) ?? { motivo, total: 0, valor_perdido: 0 };
      cur.total += 1;
      cur.valor_perdido += Number(r.estimated_value ?? 0);
      map.set(motivo, cur);
    }
    // Ordem canônica da lista de motivos; "Não informado" (motivo nulo) por último.
    return Array.from(map.values()).sort(
      (a, b) => ordemMotivo(a.motivo) - ordemMotivo(b.motivo) || b.total - a.total,
    );
  });
