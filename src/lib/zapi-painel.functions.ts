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
