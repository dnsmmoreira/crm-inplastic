/**
 * Diagnóstico de lead recusado na gravação (42501 / RLS).
 *
 * Motivo: a mensagem "este lead pertence a outro vendedor" era mostrada em
 * QUALQUER recusa de permissão, inclusive quando o dono no banco era a própria
 * pessoa (o caso "ELO SOLUCAO", em que o payload é que estava errado). Agora a
 * tela pergunta ao servidor quem é o dono de verdade antes de acusar alguém, e
 * toda recusa fica registrada em /falhas.
 *
 * Só devolve um sinalizador — nunca o nome ou os dados do dono, para não vazar
 * registro de outra equipe.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const diagnosticarLeadRecusado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; mensagem: string; codigo?: string }) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(50),
        mensagem: z.string().max(1000),
        codigo: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ dono_outro: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linhas } = await supabaseAdmin
      .from("leads")
      .select("id, owner_id")
      .in("id", data.ids);

    const donoOutro = ((linhas ?? []) as Array<{ owner_id: string | null }>).some(
      (l) => !!l.owner_id && l.owner_id !== context.userId,
    );

    const { registrarFalhaAdmin } = await import("@/lib/falhas.server");
    await registrarFalhaAdmin("crm-sync.leads/recusado", data.mensagem, {
      ids: data.ids,
      codigo: data.codigo ?? null,
      user_id: context.userId,
      dono_outro: donoOutro,
    });

    return { dono_outro: donoOutro };
  });
