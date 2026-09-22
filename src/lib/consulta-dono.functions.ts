/**
 * Consulta "de quem é este cadastro?" — porta única para as telas.
 *
 * Devolve apenas `{ existe, semDono, donoNome, donoEquipe, podeVerRegistro,
 * empresa }`. Nunca o registro em si.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import type { ConsultaDonoResultado } from "@/lib/consulta-dono.server";

export const consultarDonoDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        cnpj: z.string().trim().optional().nullable(),
        cpf: z.string().trim().optional().nullable(),
        telefone: z.string().trim().optional().nullable(),
        email: z.string().trim().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ConsultaDonoResultado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consultarDonoPorContato } = await import("@/lib/consulta-dono.server");
    return await consultarDonoPorContato(supabaseAdmin, context.userId, data);
  });
