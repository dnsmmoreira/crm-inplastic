import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

/**
 * Aceite persistente de alertas (notificacoes.exige_aceite).
 *
 * Toda escrita passa por aqui, autenticada, e só toca a notificação do próprio
 * usuário logado (`user_id = context.userId`) — a RLS já garante isso, mas o
 * filtro explícito evita depender só dela.
 */

const idInput = (input: { notificacao_id: string }) =>
  z.object({ notificacao_id: z.string().uuid() }).parse(input);

export const aceitarAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const nowIso = new Date().toISOString();
    const { error } = await context.supabase
      .from("notificacoes")
      .update({ aceito_em: nowIso, lida_em: nowIso })
      .eq("id", data.notificacao_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(`Falha ao registrar aceite: ${error.message}`);
    return { ok: true };
  });

export const adiarAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { notificacao_id: string; minutos?: number }) =>
    z
      .object({
        notificacao_id: z.string().uuid(),
        minutos: z
          .number()
          .int()
          .min(1)
          .max(24 * 60)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; adiado_ate: string }> => {
    const minutos = data.minutos ?? 10;
    const ate = new Date(Date.now() + minutos * 60_000).toISOString();
    // Adiar não é aceitar: nenhum campo de aceite/leitura é tocado aqui.
    const { error } = await context.supabase
      .from("notificacoes")
      .update({ adiado_ate: ate })
      .eq("id", data.notificacao_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(`Falha ao adiar alerta: ${error.message}`);
    return { ok: true, adiado_ate: ate };
  });
