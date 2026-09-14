/**
 * Expurgo automático dos anexos do Chat Interno (15 dias corridos).
 *
 * Regras inegociáveis:
 *  • A MENSAGEM NUNCA É APAGADA — só o arquivo sai do storage e os campos
 *    `anexo_*` daquela linha viram null. O histórico continua íntegro.
 *  • Só entram linhas com `anexo_path` não nulo e `criado_em` anterior a
 *    (agora - 15 dias). Comparação sempre em UTC (ISO), sem fuso local.
 *  • Lote de 200 por execução; idempotente.
 *  • Autenticação: mesmo segredo dos hooks do Xerife (`x-xerife-secret`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";
import {
  anexosChatExpirados,
  DIAS_RETENCAO_ANEXO_CHAT,
  type AnexoExpuravel,
} from "@/lib/chat-interno";
import { registrarFalhaSegura } from "@/lib/guard-erros";

export const BUCKET_CHAT_ANEXOS = "chat-anexos";
export const LOTE_EXPURGO_CHAT = 200;

async function executar(): Promise<{ candidatos: number; removidos: number; erros: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = new Date();
  const limite = new Date(agora.getTime() - DIAS_RETENCAO_ANEXO_CHAT * 86400_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("chat_mensagens")
    .select("id, criado_em, anexo_path")
    .not("anexo_path", "is", null)
    .lt("criado_em", limite)
    .order("criado_em", { ascending: true })
    .limit(LOTE_EXPURGO_CHAT);
  if (error) {
    await registrarFalhaSegura("chat.anexos.expurgo/select", error);
    throw new Error(error.message);
  }

  // Segunda barreira: a pura confere de novo idade e presença do arquivo.
  const alvos = anexosChatExpirados((data ?? []) as AnexoExpuravel[], agora);
  let removidos = 0;
  let erros = 0;

  for (const msg of alvos) {
    try {
      const { error: sErr } = await supabaseAdmin.storage
        .from(BUCKET_CHAT_ANEXOS)
        .remove([msg.anexo_path as string]);
      // Arquivo já ausente não impede a limpeza dos campos.
      if (sErr) await registrarFalhaSegura("chat.anexos.expurgo/storage", sErr, { id: msg.id });

      const { error: uErr } = await supabaseAdmin
        .from("chat_mensagens")
        .update({
          anexo_path: null,
          anexo_nome: null,
          anexo_tipo: null,
          anexo_tamanho_bytes: null,
        })
        .eq("id", msg.id)
        .not("anexo_path", "is", null);
      if (uErr) throw new Error(uErr.message);

      removidos += 1;
    } catch (e) {
      erros += 1;
      await registrarFalhaSegura("chat.anexos.expurgo/mensagem", e, { id: msg.id });
    }
  }

  return { candidatos: alvos.length, removidos, erros };
}

export const Route = createFileRoute("/api/public/hooks/chat-anexos-expurgo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await requireXerifeCronAuth(request);
        if (negado) return negado;
        try {
          return cronJsonResponse(await executar());
        } catch (e) {
          await registrarFalhaSegura("chat.anexos.expurgo", e);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
