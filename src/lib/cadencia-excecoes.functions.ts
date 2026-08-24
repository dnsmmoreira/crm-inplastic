import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export type ExcecaoRow = {
  id: string;
  escopo: "cliente" | "familia";
  cliente_id: string | null;
  cliente_nome: string | null;
  familia: string | null;
  stage: string;
  dias: number[] | null;
  escalar_diretoria: boolean;
  ativo: boolean;
  observacao: string | null;
  updated_at: string;
};

export const listCadenciaExcecoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExcecaoRow[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cadencia_excecoes")
      .select("*")
      .order("escopo", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const clienteIds = Array.from(
      new Set(rows.map((r) => r.cliente_id).filter((x): x is string => !!x)),
    );
    const nomes = new Map<string, string>();
    if (clienteIds.length) {
      const { data: cs } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .in("id", clienteIds);
      for (const c of cs ?? [])
        nomes.set(c.id, (c.nome_fantasia || c.razao_social) ?? "—");
    }

    return rows.map((r) => ({
      id: r.id,
      escopo: r.escopo,
      cliente_id: r.cliente_id,
      cliente_nome: r.cliente_id ? (nomes.get(r.cliente_id) ?? null) : null,
      familia: r.familia,
      stage: r.stage,
      dias: Array.isArray(r.dias) ? r.dias.map(Number) : null,
      escalar_diretoria: !!r.escalar_diretoria,
      ativo: !!r.ativo,
      observacao: r.observacao,
      updated_at: r.updated_at,
    }));
  });

/** Opções para os selects do painel: clientes ativos e famílias de produto. */
export const getCadenciaOpcoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: clientes }, { data: produtos }] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social")
        .limit(1000),
      supabase.from("produtos").select("family").not("family", "is", null).limit(2000),
    ]);
    const familias = Array.from(
      new Set(
        (produtos ?? [])
          .map((p) => (p.family ?? "").trim())
          .filter((f) => f !== ""),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      clientes: (clientes ?? []).map((c) => ({
        id: c.id,
        nome: (c.nome_fantasia || c.razao_social) ?? "—",
      })),
      familias,
    };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  escopo: z.enum(["cliente", "familia"]),
  cliente_id: z.string().uuid().nullable().optional(),
  familia: z.string().trim().min(1).nullable().optional(),
  stage: z.string().min(1),
  dias: z.array(z.number().int().positive()).max(6).nullable().optional(),
  escalar_diretoria: z.boolean().default(true),
  ativo: z.boolean().default(true),
  observacao: z.string().trim().max(500).nullable().optional(),
});

export const saveCadenciaExcecao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      escopo: data.escopo,
      cliente_id: data.escopo === "cliente" ? (data.cliente_id ?? null) : null,
      familia: data.escopo === "familia" ? (data.familia ?? null) : null,
      stage: data.stage,
      dias:
        data.dias && data.dias.length
          ? Array.from(new Set(data.dias)).sort((a, b) => a - b)
          : null,
      escalar_diretoria: data.escalar_diretoria,
      ativo: data.ativo,
      observacao: data.observacao ?? null,
    };
    if (data.escopo === "cliente" && !payload.cliente_id)
      throw new Error("Selecione o cliente da exceção.");
    if (data.escopo === "familia" && !payload.familia)
      throw new Error("Selecione o tipo (família) de produto.");

    if (data.id) {
      const { error } = await supabase
        .from("cadencia_excecoes")
        .update(payload as any)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await supabase
      .from("cadencia_excecoes")
      .insert({ ...payload, created_by: userId } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

export const deleteCadenciaExcecao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cadencia_excecoes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
