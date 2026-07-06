import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marca a conversa como "humano_atendendo" e desliga a IA.
 * RLS: admin sempre pode; vendedor só se for dono do lead.
 */
export const assumirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ status: "humano_atendendo", ia_ativa: false })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
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
