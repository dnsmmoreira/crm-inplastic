import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar a fila.");
}

export const listFila = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: fila, error } = await supabase
      .from("fila_vendedores")
      .select("user_id, posicao, ativo")
      .order("posicao", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (fila ?? []).map((f) => f.user_id);
    if (ids.length === 0) return [] as Array<{ user_id: string; posicao: number; ativo: boolean; name: string; avatar_color: string }>;
    const { data: profiles } = await supabase.from("profiles").select("id, name, avatar_color").in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (fila ?? []).map((f) => ({
      user_id: f.user_id,
      posicao: f.posicao,
      ativo: f.ativo,
      name: byId.get(f.user_id)?.name ?? "—",
      avatar_color: byId.get(f.user_id)?.avatar_color ?? "#64748b",
    }));
  });

export const addFilaMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: max } = await supabase
      .from("fila_vendedores")
      .select("posicao")
      .order("posicao", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((max?.posicao ?? 0) as number) + 1;
    const { error } = await supabase
      .from("fila_vendedores")
      .insert({ user_id: data.userId, posicao: nextPos, ativo: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFilaMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("fila_vendedores").delete().eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFilaAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("fila_vendedores")
      .update({ ativo: data.ativo })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reordena a fila. Recebe a lista completa de user_ids na nova ordem.
 * Grava posições em passos de 10 para evitar conflitos de UNIQUE (se houver).
 */
export const reorderFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ order: z.array(z.string().uuid()).min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    for (let i = 0; i < data.order.length; i++) {
      const { error } = await supabase
        .from("fila_vendedores")
        .update({ posicao: (i + 1) * 10 })
        .eq("user_id", data.order[i]);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
