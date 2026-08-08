import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Mascara o telefone deixando visíveis apenas os 4 últimos dígitos. */
function mascararPhone(phone: string) {
  const p = String(phone ?? "");
  if (p.length <= 4) return p;
  return `${"•".repeat(Math.max(3, p.length - 4))}${p.slice(-4)}`;
}

async function exigirAdmin(supabase: { rpc: Function }, userId: string) {
  const { data: isAdmin } = await (supabase as any).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

/** Painel de saúde: envios recentes, opt-outs e alertas (somente admin). */
export const painelWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const agora = Date.now();
    const iso = (ms: number) => new Date(agora - ms).toISOString();

    const [envios24h, enviosRecentes, optouts, alertas] = await Promise.all([
      supabase.from("zapi_envios").select("canal, created_at").gte("created_at", iso(24 * 60 * 60_000)),
      supabase
        .from("zapi_envios")
        .select("id, canal, phone, ctx, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("whatsapp_optout")
        .select("phone, motivo, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("zapi_alertas")
        .select("id, canal, tipo, detalhe, created_at")
        .gte("created_at", iso(48 * 60 * 60_000))
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const linhas24h = envios24h.data ?? [];
    const porCanal: Record<string, number> = {};
    let ultimaHora = 0;
    const corteHora = agora - 60 * 60_000;
    for (const l of linhas24h) {
      porCanal[l.canal] = (porCanal[l.canal] ?? 0) + 1;
      if (new Date(l.created_at).getTime() >= corteHora) ultimaHora += 1;
    }

    return {
      envios: {
        total24h: linhas24h.length,
        porCanal24h: porCanal,
        ultimaHora,
        recentes: (enviosRecentes.data ?? []).map((e) => ({
          id: e.id,
          canal: e.canal,
          phone: mascararPhone(e.phone),
          ctx: e.ctx,
          created_at: e.created_at,
        })),
      },
      optouts: {
        total: optouts.count ?? (optouts.data?.length ?? 0),
        recentes: (optouts.data ?? []).map((o) => ({
          phone: o.phone,
          phoneMascarado: mascararPhone(o.phone),
          motivo: o.motivo,
          created_at: o.created_at,
        })),
      },
      alertas48h: alertas.data ?? [],
    };
  });

/** Remove um opt-out (somente admin). */
export const removerOptout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ phone: z.string().min(6) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_optout").delete().eq("phone", data.phone);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * (A) Diagnóstico dos canais de alerta interno — somente admin.
 * Retorna APENAS booleanos de presença. Jamais expõe valores, prefixos,
 * sufixos ou tamanhos das variáveis.
 */
export const diagnosticoCanaisInternos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const nomes = [
      "ZAPI_INTERNO_INSTANCE_ID",
      "ZAPI_INTERNO_TOKEN",
      "ZAPI_INTERNO_CLIENT_TOKEN",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_DIRETORIA",
      "WHATSAPP_FINANCEIRO",
    ] as const;

    const variaveis = Object.fromEntries(
      nomes.map((n) => [n, ((process.env[n] ?? "") as string).trim().length > 0]),
    ) as Record<(typeof nomes)[number], boolean>;

    const internoWhatsapp =
      variaveis.ZAPI_INTERNO_INSTANCE_ID &&
      variaveis.ZAPI_INTERNO_TOKEN &&
      variaveis.ZAPI_INTERNO_CLIENT_TOKEN &&
      variaveis.WHATSAPP_FINANCEIRO;
    const telegramDiretoria = variaveis.TELEGRAM_BOT_TOKEN && variaveis.TELEGRAM_CHAT_DIRETORIA;

    const faltantes = nomes.filter((n) => !variaveis[n]);

    return {
      variaveis,
      canais: {
        interno_whatsapp: {
          pronto: internoWhatsapp,
          faltantes: [
            "ZAPI_INTERNO_INSTANCE_ID",
            "ZAPI_INTERNO_TOKEN",
            "ZAPI_INTERNO_CLIENT_TOKEN",
            "WHATSAPP_FINANCEIRO",
          ].filter((n) => !variaveis[n as (typeof nomes)[number]]),
        },
        telegram_diretoria: {
          pronto: telegramDiretoria,
          faltantes: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_DIRETORIA"].filter(
            (n) => !variaveis[n as (typeof nomes)[number]],
          ),
        },
      },
      algumPronto: internoWhatsapp || telegramDiretoria,
      faltantes,
    };
  });

/** (D) Dispara UMA notificação interna de teste — somente admin, sob clique. */
export const enviarAlertaTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { enviarNotificacaoInterna } = await import("@/lib/xerife/notify.server");
    const phone = (process.env.WHATSAPP_FINANCEIRO ?? "").trim();
    const chatId = (process.env.TELEGRAM_CHAT_DIRETORIA ?? "").trim() || null;
    const r = await enviarNotificacaoInterna(
      phone,
      "TESTE: verificacao do canal de alerta interno do CRM. Nenhuma acao necessaria.",
      "alerta-teste",
      { telegramChatId: chatId, bypassGuards: true },
    );
    return r;
  });
