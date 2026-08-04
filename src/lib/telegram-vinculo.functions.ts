import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vínculo de usuários ao canal interno do Telegram.
 * Fase 1: apenas gera/exibe o código de vínculo e o deep link.
 * Nada é enviado a ninguém aqui.
 */

export type TelegramVinculo = {
  userId: string;
  chatIdVinculado: boolean;
  codigo: string | null;
  botUsername: string | null;
  deepLink: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdminTg(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar o vínculo do Telegram.");
}

function botUsername(): string | null {
  const raw = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  return raw || null;
}

function deepLinkFor(codigo: string | null): string | null {
  const bot = botUsername();
  if (!bot || !codigo) return null;
  return `https://t.me/${bot}?start=${codigo}`;
}

function novoCodigo(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getTelegramVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<TelegramVinculo> => {
    await assertAdminTg(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error } = await supabaseAdmin
      .from("profiles")
      .select("id, telegram_chat_id, telegram_vinculo_codigo")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const codigo = (prof?.telegram_vinculo_codigo ?? null) as string | null;
    return {
      userId: data.userId,
      chatIdVinculado: !!(prof?.telegram_chat_id ?? null),
      codigo,
      botUsername: botUsername(),
      deepLink: deepLinkFor(codigo),
    };
  });

export const gerarTelegramVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<TelegramVinculo> => {
    await assertAdminTg(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codigo = novoCodigo();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_vinculo_codigo: codigo })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id")
      .eq("id", data.userId)
      .maybeSingle();
    return {
      userId: data.userId,
      chatIdVinculado: !!(prof?.telegram_chat_id ?? null),
      codigo,
      botUsername: botUsername(),
      deepLink: deepLinkFor(codigo),
    };
  });
