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
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_DIRETORIA",
      "WHATSAPP_FINANCEIRO",
    ] as const;

    const variaveis = Object.fromEntries(
      nomes.map((n) => [n, ((process.env[n] ?? "") as string).trim().length > 0]),
    ) as Record<(typeof nomes)[number], boolean>;

    const internoWhatsapp = false;
    const telegramDiretoria = variaveis.TELEGRAM_BOT_TOKEN && variaveis.TELEGRAM_CHAT_DIRETORIA;

    const faltantes = nomes.filter((n) => !variaveis[n]);

    return {
      variaveis,
      canais: {
        interno_whatsapp: {
          pronto: internoWhatsapp,
          faltantes: ["Canal desativado — alertas internos saem por Telegram"],
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

/**
 * Envio de TESTE pela Cloud API oficial (somente admin).
 * Usa o MESMO driver de saída (`sendWhatsappText`), com todas as guardas ativas,
 * e grava conversa/mensagem pelo mesmo fluxo dos envios normais.
 */
export const testarEnvioCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        telefone: z.string().min(8).max(20),
        template: z.string().trim().min(1).max(80).optional(),
        idioma: z.string().trim().min(2).max(10).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const template = data.template?.trim() || "hello_world";
    const idioma = data.idioma?.trim() || "en_US";

    let phone = String(data.telefone).replace(/\D/g, "");
    if (!phone.startsWith("55") && phone.length <= 11) phone = `55${phone}`;
    if (phone.length < 10) throw new Error("Telefone inválido.");

    const conteudo = `[teste] template=${template} (${idioma})`;

    let ok = false;
    let httpStatus: number | null = null;
    let messageId: string | null = null;
    let erroCodigo: string | null = null;
    let erroMensagem: string | null = null;

    // Flag fixa no código: somente este teste administrativo ignora a janela.
    const janelaIgnorada = true;

    try {
      const { sendWhatsappText } = await import("./whatsapp-send.server");
      const r = await sendWhatsappText(phone, conteudo, "teste-cloud", "comercial", {
        templateOverride: { name: template, lang: idioma },
        ignorarJanelaHorario: janelaIgnorada,
      });
      ok = r.ok;
      httpStatus = r.status ?? null;
      messageId = r.messageId ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      erroMensagem = msg.slice(0, 500);
      const mStatus = msg.match(/\[(\d{3})\]/);
      if (mStatus) httpStatus = Number(mStatus[1]);
      const mCode = msg.match(/"code"\s*:\s*(\d+)/);
      if (mCode) erroCodigo = mCode[1] ?? null;
    }

    // Log único, sem nenhum valor de token/secret.
    console.log(
      `WA-CLOUD teste_envio http_status=${httpStatus ?? "-"} message_id=${messageId ?? "-"} erro_codigo=${erroCodigo ?? "-"} janela_ignorada=${janelaIgnorada}`,
    );


    if (ok) {
      // Persistência pelo fluxo existente: conversa + mensagem de saída.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existente } = await supabaseAdmin
        .from("whatsapp_conversas")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      let conversaId = existente?.id ?? null;
      if (!conversaId) {
        const { data: criada } = await supabaseAdmin
          .from("whatsapp_conversas")
          .insert({
            phone,
            name: null,
            status: "humano_atendendo",
            ia_ativa: false,
            atribuido_para: userId,
          })
          .select("id")
          .single();
        conversaId = criada?.id ?? null;
      }
      if (conversaId) {
        await supabaseAdmin.from("whatsapp_mensagens").insert({
          conversa_id: conversaId,
          direcao: "saida",
          autor: "vendedor",
          conteudo,
          usuario_id: userId,
        });
      }
    }

    return {
      ok,
      http_status: httpStatus,
      message_id: messageId,
      erro_codigo: erroCodigo,
      erro_mensagem: erroMensagem,
      telefone_mascarado: mascararPhone(phone),
    };
  });

/** (A) Diagnóstico somente leitura do número na Cloud API — somente admin. */
export const diagnosticoCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { cloudDiagnosticoNumero } = await import("./whatsapp-cloud.server");
    const r = await cloudDiagnosticoNumero();

    const codigo =
      r.dados && typeof r.dados === "object" && "error" in (r.dados as Record<string, unknown>)
        ? ((r.dados as { error?: { code?: number } }).error?.code ?? null)
        : null;
    console.log(`WA-CLOUD diagnostico http_status=${r.http_status ?? "-"} erro_codigo=${codigo ?? "-"}`);

    return {
      configurado: r.configurado,
      http_status: r.http_status,
      dados_json: JSON.stringify(r.dados ?? null),
    };
  });

/** (Assinatura) Lista apps inscritos na WABA — somente admin, somente leitura. */
export const listarAppsInscritos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { cloudListarAppsInscritos } = await import("./whatsapp-cloud.server");
    const r = await cloudListarAppsInscritos();
    console.log(`WA-CLOUD subscribed_apps_listar http_status=${r.http_status ?? "-"} ok=${r.ok}`);

    return { ok: r.ok, http_status: r.http_status, dados_json: JSON.stringify(r.body ?? null) };
  });

/** (Assinatura) Inscreve o app na WABA — somente admin. */
export const inscreverWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { cloudInscreverWaba } = await import("./whatsapp-cloud.server");
    const r = await cloudInscreverWaba();
    console.log(`WA-CLOUD subscribed_apps_inscrever http_status=${r.http_status ?? "-"} ok=${r.ok}`);

    return { ok: r.ok, http_status: r.http_status, dados_json: JSON.stringify(r.body ?? null) };
  });

/**
 * (B) Registro do número na Cloud API — somente admin.
 * O PIN vem do formulário, vai direto para a Graph API e não é gravado nem logado.
 */
export const registrarNumeroCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await exigirAdmin(supabase, userId);

    const { cloudRegistrarNumero } = await import("./whatsapp-cloud.server");
    const r = await cloudRegistrarNumero(data.pin);

    console.log(
      `WA-CLOUD registro http_status=${r.http_status ?? "-"} erro_codigo=${r.erro_codigo ?? "-"}`,
    );

    return {
      ok: r.ok,
      http_status: r.http_status,
      erro_codigo: r.erro_codigo,
      erro_mensagem: r.erro_mensagem,
    };
  });
