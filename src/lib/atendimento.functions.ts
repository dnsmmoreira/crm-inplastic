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
