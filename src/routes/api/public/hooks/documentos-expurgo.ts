/**
 * Expurgo automático de documentos vencidos (regra de 12 meses).
 *
 * Regras inegociáveis:
 *  • A LINHA NUNCA É APAGADA — só o arquivo sai do storage e a linha é
 *    marcada com `removido_em`. O histórico continua auditável.
 *  • `expira_em is null` nunca entra (comprovantes de entrega são prova
 *    fiscal/legal e não expiram).
 *  • Lote de 200 por execução; idempotente (só pega `removido_em is null`).
 *  • Autenticação: mesmo segredo dos hooks do Xerife (`x-xerife-secret`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireXerifeCronAuth, cronJsonResponse } from "@/lib/xerife/cron-auth.server";
import { documentosExpirados, type DocumentoExpuravel } from "@/lib/documentos";
import { BUCKET_DOCUMENTOS } from "@/lib/documentos.functions";
import { registrarFalhaSegura } from "@/lib/guard-erros";

export const LOTE_EXPURGO = 200;
/** Campo usado em `user_audit_log` para registrar cada expurgo. */
export const CAMPO_AUDITORIA_EXPURGO = "documento_expurgado";

async function executar(): Promise<{ candidatos: number; removidos: number; erros: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const agora = new Date();

  const { data, error } = await supabaseAdmin
    .from("documentos")
    .select("id, categoria, expira_em, removido_em, storage_path")
    .lt("expira_em", agora.toISOString())
    .not("expira_em", "is", null)
    .is("removido_em", null)
    .order("expira_em", { ascending: true })
    .limit(LOTE_EXPURGO);
  if (error) {
    await registrarFalhaSegura("documentos.expurgo/select", error);
    throw new Error(error.message);
  }

  const alvos = documentosExpirados((data ?? []) as DocumentoExpuravel[], agora);
  let removidos = 0;
  let erros = 0;

  for (const doc of alvos) {
    try {
      if (doc.storage_path) {
        const { error: sErr } = await supabaseAdmin.storage
          .from(BUCKET_DOCUMENTOS)
          .remove([doc.storage_path]);
        // Arquivo já ausente não impede a marcação da linha.
        if (sErr) await registrarFalhaSegura("documentos.expurgo/storage", sErr, { id: doc.id });
      }

      const { error: uErr } = await supabaseAdmin
        .from("documentos")
        .update({ removido_em: agora.toISOString(), removido_por: null })
        .eq("id", doc.id)
        .is("removido_em", null);
      if (uErr) throw new Error(uErr.message);

      const { error: aErr } = await supabaseAdmin.from("user_audit_log").insert({
        alvo_user_id: null,
        ator_user_id: null,
        campo: CAMPO_AUDITORIA_EXPURGO,
        valor_anterior: doc.expira_em,
        valor_novo: doc.id,
      });
      if (aErr) await registrarFalhaSegura("documentos.expurgo/auditoria", aErr, { id: doc.id });

      removidos += 1;
    } catch (e) {
      erros += 1;
      await registrarFalhaSegura("documentos.expurgo/documento", e, { id: doc.id });
    }
  }

  return { candidatos: alvos.length, removidos, erros };
}

export const Route = createFileRoute("/api/public/hooks/documentos-expurgo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await requireXerifeCronAuth(request);
        if (negado) return negado;
        try {
          return cronJsonResponse(await executar());
        } catch (e) {
          await registrarFalhaSegura("documentos.expurgo", e);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
