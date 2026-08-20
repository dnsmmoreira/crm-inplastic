/**
 * Server functions do módulo de Licitações (tabela `arena_licitacoes`).
 *
 * Ciclo próprio: identificação → habilitação → pregão → homologação →
 * empenho → recebimento. NÃO gera lead, proposta ou pedido, e não toca
 * no funil de vendas.
 *
 * Todas as funções exigem a permissão `licitacoes.gerenciar`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const SITUACOES_LICITACAO = [
  "Identificada",
  "Habilitada",
  "Em pregão",
  "Homologada",
  "Empenhada",
  "Recebida",
  "Perdida",
  "Cancelada",
] as const;

export type SituacaoLicitacao = (typeof SITUACOES_LICITACAO)[number];

export type LicitacaoRow = {
  id: string;
  orgao: string;
  objeto: string;
  modalidade: string | null;
  numero: string | null;
  situacao: string;
  valor_estimado: number;
  valor_proposto: number;
  valor_homologado: number;
  valor_empenhado: number;
  valor_recebido: number;
  data_identificacao: string | null;
  data_habilitacao: string | null;
  data_pregao: string | null;
  data_homologacao: string | null;
  data_empenho: string | null;
  observacao: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertGerenciaLicitacoes(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "licitacoes.gerenciar",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Você não tem permissão para gerenciar licitações.");
}

const dateOpt = z.string().trim().min(1).nullable().optional();

const payloadSchema = z.object({
  orgao: z.string().trim().min(1, "Informe o órgão"),
  objeto: z.string().trim().min(1, "Informe o objeto"),
  modalidade: z.string().trim().nullable().optional(),
  numero: z.string().trim().nullable().optional(),
  situacao: z.enum(SITUACOES_LICITACAO),
  valor_estimado: z.number().nonnegative().default(0),
  valor_proposto: z.number().nonnegative().default(0),
  valor_homologado: z.number().nonnegative().default(0),
  valor_empenhado: z.number().nonnegative().default(0),
  valor_recebido: z.number().nonnegative().default(0),
  data_identificacao: dateOpt,
  data_habilitacao: dateOpt,
  data_pregao: dateOpt,
  data_homologacao: dateOpt,
  data_empenho: dateOpt,
  observacao: z.string().trim().nullable().optional(),
});

const SELECT_COLS =
  "id, orgao, objeto, modalidade, numero, situacao, valor_estimado, valor_proposto, valor_homologado, valor_empenhado, valor_recebido, data_identificacao, data_habilitacao, data_pregao, data_homologacao, data_empenho, observacao";

export const listLicitacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { situacao?: string | null; de?: string | null; ate?: string | null }) =>
    z
      .object({
        situacao: z.string().nullable().optional(),
        de: z.string().nullable().optional(),
        ate: z.string().nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertGerenciaLicitacoes(context.supabase, context.userId);
    let q = context.supabase.from("arena_licitacoes").select(SELECT_COLS);
    if (data.situacao) q = q.eq("situacao", data.situacao);
    if (data.de) q = q.gte("data_pregao", data.de);
    if (data.ate) q = q.lte("data_pregao", data.ate);
    const { data: rows, error } = await q.order("data_pregao", {
      ascending: false,
      nullsFirst: false,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as LicitacaoRow[];
  });

export const saveLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().nullable().optional(), values: payloadSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGerenciaLicitacoes(context.supabase, context.userId);
    const values = {
      ...data.values,
      modalidade: data.values.modalidade || null,
      numero: data.values.numero || null,
      observacao: data.values.observacao || null,
      data_identificacao: data.values.data_identificacao || null,
      data_habilitacao: data.values.data_habilitacao || null,
      data_pregao: data.values.data_pregao || null,
      data_homologacao: data.values.data_homologacao || null,
      data_empenho: data.values.data_empenho || null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("arena_licitacoes")
        .update(values)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("arena_licitacoes")
      .insert({ ...values, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertGerenciaLicitacoes(context.supabase, context.userId);
    const { error } = await context.supabase.from("arena_licitacoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
