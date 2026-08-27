import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { escolherSugestaoTransportadora, normalizarUf, type UsoTransportadora } from "@/lib/transportadoras";

export type TransportadoraRow = {
  id: string;
  nome: string;
  ativo: boolean;
};

export const listarTransportadoras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transportadoras")
      .select("id, nome, ativo")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TransportadoraRow[];
  });

export const listarTransportadorasAtivas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transportadoras")
      .select("id, nome, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TransportadoraRow[];
  });

export const criarTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ nome: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("transportadoras")
      .insert({ nome: data.nome })
      .select("id, nome, ativo")
      .single();
    if (error) throw new Error(error.message);
    return row as TransportadoraRow;
  });

export const atualizarTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        nome: z.string().trim().min(2).max(120).optional(),
        ativo: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    const { data: row, error } = await context.supabase
      .from("transportadoras")
      .update(patch)
      .eq("id", data.id)
      .select("id, nome, ativo")
      .single();
    if (error) throw new Error(error.message);
    return row as TransportadoraRow;
  });

export const excluirTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("transportadoras").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sugere a transportadora mais usada em propostas de clientes do mesmo UF.
 * Só considera `transport.carrierTransportadoraId` (id estruturado) — texto
 * livre e opções especiais nunca entram na conta. Sem base, retorna null.
 */
export const sugerirTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ uf: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const uf = normalizarUf(data.uf);
    if (!uf) return null;

    const { data: rows, error } = await context.supabase
      .from("propostas")
      .select("transport, leads!inner(estado, clientes(estado))")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const usos: UsoTransportadora[] = (rows ?? []).map((r) => {
      const t = (r as { transport?: Record<string, unknown> | null }).transport ?? {};
      const lead = (r as { leads?: { estado?: string | null; clientes?: { estado?: string | null } | null } | null }).leads;
      return {
        transportadoraId: (t as { carrierTransportadoraId?: string | null }).carrierTransportadoraId ?? null,
        uf: lead?.clientes?.estado ?? lead?.estado ?? null,
      };
    });

    const escolha = escolherSugestaoTransportadora(usos, uf);
    if (!escolha) return null;

    const { data: t } = await context.supabase
      .from("transportadoras")
      .select("id, nome, ativo")
      .eq("id", escolha.transportadoraId)
      .eq("ativo", true)
      .maybeSingle();
    if (!t) return null;
    return { ...(t as TransportadoraRow), usos: escolha.usos, uf };
  });
