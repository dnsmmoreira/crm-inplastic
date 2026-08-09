/**
 * (E4) Disjuntor de envios automáticos da IA — estado em `zapi_estado`.
 * Nunca lança: qualquer falha aqui é logada e tratada como "não pausado",
 * exceto na checagem explícita de bloqueio (que é fail-open por design para
 * não derrubar o atendimento).
 */
import {
  JANELA_FALHAS_MS,
  calcularPausadoAte,
  deveAbrirPorFalhas,
  pausaAtiva,
} from "./zapi-disjuntor";

const CHAVE = "envio_pausado";

type EstadoValor = { pausado?: boolean; pausado_ate?: string | null; motivo?: string | null };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function alertarInterno(texto: string) {
  try {
    const chatId = (process.env.TELEGRAM_CHAT_DIRETORIA ?? "").trim();
    if (!chatId) return;
    const { sendTelegramText } = await import("./telegram-send.server");
    await sendTelegramText(chatId, texto, "disjuntor");
  } catch (e) {
    console.error("[disjuntor] falha ao alertar:", e instanceof Error ? e.message : String(e));
  }
}

export async function lerEstadoDisjuntor(): Promise<EstadoValor> {
  try {
    const sb = await admin();
    const { data } = await sb.from("zapi_estado").select("valor").eq("chave", CHAVE).maybeSingle();
    return (data?.valor ?? {}) as EstadoValor;
  } catch (e) {
    console.error("[disjuntor] falha ao ler estado:", e instanceof Error ? e.message : String(e));
    return {};
  }
}

/** True quando os envios automáticos estão pausados agora. */
export async function envioAutomaticoPausado(): Promise<boolean> {
  const estado = await lerEstadoDisjuntor();
  if (!estado.pausado) return false;
  if (pausaAtiva(estado.pausado_ate ?? null, Date.now())) return true;
  // Pausa expirou → fecha automaticamente.
  await fecharDisjuntor("tempo_expirado");
  return false;
}

export async function abrirDisjuntor(motivo: string): Promise<void> {
  try {
    const estado = await lerEstadoDisjuntor();
    if (estado.pausado && pausaAtiva(estado.pausado_ate ?? null, Date.now())) return;
    const pausadoAte = calcularPausadoAte(Date.now());
    const sb = await admin();
    await sb.from("zapi_estado").upsert(
      {
        chave: CHAVE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valor: { pausado: true, pausado_ate: pausadoAte, motivo } as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chave" },
    );
    console.warn(`[disjuntor] ABERTO motivo=${motivo} ate=${pausadoAte}`);
    await alertarInterno(
      `DISJUNTOR ABERTO — envios automaticos do WhatsApp pausados por 30 minutos.\nMotivo: ${motivo}\nRetorno previsto: ${pausadoAte}\nhttps://crm.inplastic.com.br/canais`,
    );
  } catch (e) {
    console.error("[disjuntor] falha ao abrir:", e instanceof Error ? e.message : String(e));
  }
}

export async function fecharDisjuntor(motivo: string): Promise<void> {
  try {
    const sb = await admin();
    await sb.from("zapi_estado").upsert(
      {
        chave: CHAVE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valor: { pausado: false, pausado_ate: null, motivo } as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chave" },
    );
    console.log(`[disjuntor] FECHADO motivo=${motivo}`);
    await alertarInterno(
      `DISJUNTOR FECHADO — envios automaticos do WhatsApp liberados novamente.\nMotivo: ${motivo}`,
    );
  } catch (e) {
    console.error("[disjuntor] falha ao fechar:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Registra uma falha de entrega e abre o disjuntor quando houver 5 ou mais
 * falhas nos últimos 10 minutos.
 */
export async function registrarFalhaEntrega(detalhe: string): Promise<void> {
  try {
    const sb = await admin();
    const desde = new Date(Date.now() - JANELA_FALHAS_MS).toISOString();
    const { count } = await sb
      .from("zapi_eventos")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "falha_entrega")
      .gte("created_at", desde);
    if (deveAbrirPorFalhas(count ?? 0)) {
      await abrirDisjuntor(`falhas_entrega=${count} em 10min — ${detalhe.slice(0, 200)}`);
    }
  } catch (e) {
    console.error(
      "[disjuntor] falha ao contabilizar entrega:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
