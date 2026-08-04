import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Telegram (canal INTERNO).
 * Fase 1: apenas processa "/start CODIGO" para vincular o chat ao perfil.
 * Nunca responde mensagem, sempre 200 rápido.
 */

type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
  edited_message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

const OK = () => new Response(null, { status: 200 });

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
          const provided = (
            request.headers.get("x-telegram-bot-api-secret-token") ?? ""
          ).trim();
          if (!expected || !provided || provided !== expected) return OK();

          const update = (await request.json().catch(() => null)) as TgUpdate | null;
          const msg = update?.message ?? update?.edited_message;
          const texto = (msg?.text ?? "").trim();
          const chatId = msg?.chat?.id;
          if (!texto || chatId === undefined || chatId === null) return OK();

          const match = /^\/start\s+(\S+)$/.exec(texto);
          if (!match) return OK();
          const codigo = match[1];

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("telegram_vinculo_codigo", codigo)
            .maybeSingle();
          if (!prof?.id) return OK();

          await supabaseAdmin
            .from("profiles")
            .update({
              telegram_chat_id: String(chatId),
              telegram_vinculo_codigo: null,
            })
            .eq("id", prof.id);

          return OK();
        } catch (e) {
          console.error(
            "[telegram/webhook] erro:",
            e instanceof Error ? e.message : String(e),
          );
          return OK();
        }
      },
    },
  },
});
