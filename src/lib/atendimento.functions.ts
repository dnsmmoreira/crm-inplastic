import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marca a conversa como "humano_atendendo", desliga a IA, garante a atribuição
 * ao usuário que assumiu e marca as notificações dessa conversa como lidas.
 * RLS: admin sempre pode; vendedor só se for dono do lead ou o atribuído.
 */
export const assumirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: atual } = await supabase
      .from("whatsapp_conversas")
      .select("atribuido_para")
      .eq("id", data.conversaId)
      .maybeSingle();

    const patch = {
      status: "humano_atendendo" as const,
      ia_ativa: false,
      ...(atual?.atribuido_para ? {} : { atribuido_para: userId }),
    };


    const { error } = await supabase
      .from("whatsapp_conversas")
      .update(patch)
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("conversa_id", data.conversaId)
      .eq("user_id", userId)
      .is("lida_em", null);

    return { ok: true };
  });


/**
 * Devolve a conversa para a IA.
 */
export const devolverParaIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ status: "ia_atendendo", ia_ativa: true })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Encerra a conversa: status='encerrado' e limpa requer_humano.
 * Não dispara nenhuma mensagem de WhatsApp.
 */
export const encerrarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ status: "encerrado", ia_ativa: false, requer_humano: false })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);

    await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("conversa_id", data.conversaId)
      .eq("user_id", userId)
      .is("lida_em", null);

    return { ok: true };
  });

/**
 * Lista os vendedores ativos (admin apenas) para o seletor de atribuição.
 */
export const listarVendedoresAtendimento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const isAdmin = (roles ?? []).some((r) => r.user_id === userId && r.role === "admin");
    if (!isAdmin) return [] as Array<{ id: string; name: string }>;
    const vendedorIds = (roles ?? []).filter((r) => r.role === "vendedor").map((r) => r.user_id);
    if (vendedorIds.length === 0) return [] as Array<{ id: string; name: string }>;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", vendedorIds)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("name");
    return (profiles ?? []).map((p) => ({ id: p.id, name: p.name }));
  });

/**
 * Atribui a conversa a um vendedor (admin apenas). O gatilho do banco cria a
 * notificação e preenche `atribuido_em`.
 */
export const atribuirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ conversaId: z.string().uuid(), vendedorId: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem atribuir conversas.");
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ atribuido_para: data.vendedorId })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Lista as conversas que estão com a IA e ainda sem responsável (admin apenas),
 * da mais antiga para a mais nova.
 */
export const listarConversasSemAtribuicao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return [];
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .select("id, name, phone, last_message_at, created_at, requer_humano")
      .eq("status", "ia_atendendo")
      .is("atribuido_para", null)
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        requerHumano: c.requer_humano,
        paradaDesde: c.last_message_at ?? c.created_at,
      }))
      .sort((a, b) => new Date(a.paradaDesde).getTime() - new Date(b.paradaDesde).getTime());
  });

/**
 * Atribui várias conversas de uma vez (admin apenas). Só grava onde a conversa
 * ainda está sem responsável, para não sobrescrever atribuição concorrente.
 */
export const atribuirConversasEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        atribuicoes: z
          .array(z.object({ conversaId: z.string().uuid(), vendedorId: z.string().uuid() }))
          .min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem atribuir conversas.");

    const alvos = [...new Set(data.atribuicoes.map((a) => a.vendedorId))];
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor")
      .in("user_id", alvos);
    const { data: perfis } = await supabase
      .from("profiles")
      .select("id")
      .in("id", alvos)
      .eq("ativo", true)
      .is("deleted_at", null);
    const validos = new Set(
      (roles ?? [])
        .map((r) => r.user_id)
        .filter((id) => (perfis ?? []).some((p) => p.id === id)),
    );
    const invalido = alvos.find((id) => !validos.has(id));
    if (invalido) throw new Error("Um dos responsáveis escolhidos não é um vendedor ativo.");

    let atribuidas = 0;
    let ignoradas = 0;
    for (const item of data.atribuicoes) {
      const { data: rows, error } = await supabase
        .from("whatsapp_conversas")
        .update({ atribuido_para: item.vendedorId })
        .eq("id", item.conversaId)
        .is("atribuido_para", null)
        .select("id");
      if (error) throw new Error(error.message);
      if ((rows ?? []).length > 0) atribuidas += 1;
      else ignoradas += 1;
    }
    return { atribuidas, ignoradas };
  });
