import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

type ZapiPayload = Record<string, unknown> & {
  type?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  senderName?: string;
  chatName?: string;
  text?: { message?: string };
  message?: string;
  messageId?: string;
};

/**
 * Webhook público chamado pelo Z-API quando chegam mensagens.
 * Configure no painel Z-API em: Webhooks → Ao receber → URL deste endpoint.
 *
 * Efeitos:
 *   1) Log bruto em `zapi_inbox` (para auditoria / reprocessamento).
 *   2) Upsert em `whatsapp_conversas` (uma linha por telefone).
 *   3) Insert em `whatsapp_mensagens` (autor='cliente', direcao='entrada').
 *   4) O trigger de banco atualiza `last_message_at` da conversa e
 *      `last_interaction_at` do lead vinculado (quando houver).
 */
export const Route = createFileRoute("/api/public/zapi/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as ZapiPayload;

          const phoneRaw = payload.phone ?? "";
          const phone = onlyDigits(phoneRaw);

          const { normalizarPayloadZapi, TIPOS_COM_RESPOSTA_AUTOMATICA, TIPOS_COM_HANDOFF } =
            await import("@/lib/zapi-normalize");
          const norm = normalizarPayloadZapi(payload as Record<string, unknown>);
          const message = norm.texto;

          const name = payload.senderName || payload.chatName || null;
          const externalId = typeof payload.messageId === "string" && payload.messageId.trim() !== ""
            ? payload.messageId
            : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rawJson = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

          // 1) Log bruto — SEMPRE, para TODO payload (inclusive fromMe, grupo e não-texto),
          //    antes de qualquer early return, para não perder a auditoria.
          const inboxRes = await supabaseAdmin.from("zapi_inbox").insert({
            phone,
            name,
            message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            raw: rawJson as any,
          });
          if (inboxRes.error) {
            console.error("zapi_inbox insert failed:", inboxRes.error);
          }

          // 2) Guarda de duplicidade (reentrega da Z-API).
          if (externalId) {
            const { data: jaExiste } = await supabaseAdmin
              .from("whatsapp_mensagens")
              .select("id")
              .eq("external_id", externalId)
              .maybeSingle();
            if (jaExiste?.id) {
              console.warn("[zapi-webhook] mensagem duplicada ignorada:", externalId);
              return Response.json({ ok: true, duplicado: true }, { headers: CORS });
            }
          } else {
            console.warn("[zapi-webhook] payload sem messageId — seguindo sem guarda de duplicidade");
          }

          // 3) Só depois do registro bruto e da guarda aplicamos os filtros de processamento.
          if (payload.fromMe || payload.isGroup) {
            return Response.json({ ok: true, ignored: true }, { headers: CORS });
          }

          if (!phone || !message) {
            return Response.json({ ok: true, skipped: "no-text" }, { headers: CORS });
          }

          // 4) Upsert conversa por telefone

          //    Se já existe → mantém status/ia_ativa/lead_id atuais.
          //    Se não existe → cria em 'ia_atendendo' com ia_ativa=true.
          let conversaId: string | null = null;
          {
            const { data: existing } = await supabaseAdmin
              .from("whatsapp_conversas")
              .select("id")
              .eq("phone", phone)
              .maybeSingle();

            if (existing?.id) {
              conversaId = existing.id;
              // Atualiza o nome se veio no payload e a conversa não tinha
              if (name) {
                await supabaseAdmin
                  .from("whatsapp_conversas")
                  .update({ name })
                  .eq("id", conversaId)
                  .is("name", null);
              }
            } else {
              // Tenta vincular a um lead pelo telefone_whatsapp
              const { data: leadMatch } = await supabaseAdmin
                .from("leads")
                .select("id")
                .eq("telefone_whatsapp", phone)
                .maybeSingle();

              const { data: novo, error: novoErr } = await supabaseAdmin
                .from("whatsapp_conversas")
                .insert({
                  phone,
                  name,
                  lead_id: leadMatch?.id ?? null,
                  status: "ia_atendendo",
                  ia_ativa: true,
                })
                .select("id")
                .single();
              if (novoErr) {
                console.error("whatsapp_conversas insert failed:", novoErr);
              }
              conversaId = novo?.id ?? null;
            }
          }

          // 5) Grava a mensagem do cliente
          if (conversaId) {
            const { error: msgErr } = await supabaseAdmin
              .from("whatsapp_mensagens")
              .insert({
                conversa_id: conversaId,
                direcao: "entrada",
                autor: "cliente",
                conteudo: message,
                external_id: externalId,
                tipo: norm.tipo,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                midia: (norm.midia ?? null) as any,
              });
            if (msgErr) {
              // 23505 = violação de unicidade no índice parcial → reentrega, não erro.
              if (msgErr.code === "23505") {
                console.warn("[zapi-webhook] corrida de reentrega detectada (23505):", externalId);
                return Response.json({ ok: true, duplicado: true }, { headers: CORS });
              }
              console.error("whatsapp_mensagens insert failed:", msgErr);
            }

            // 5b) Handoff humano para mídia/tipos não conversáveis.
            //     Apenas estado no banco — nenhum envio de WhatsApp é feito aqui.
            if (TIPOS_COM_HANDOFF.includes(norm.tipo)) {
              const { error: hoErr } = await supabaseAdmin
                .from("whatsapp_conversas")
                .update({
                  requer_humano: true,
                  motivo_handoff: `midia_${norm.tipo}`,
                  ia_ativa: false,
                })
                .eq("id", conversaId);
              if (hoErr) console.error("handoff update failed:", hoErr);
              return Response.json(
                { ok: true, conversaId, tipo: norm.tipo, handoff: true },
                { headers: CORS },
              );
            }

            // 5c) Reação: apenas registrada, sem handoff e sem n8n.
            if (!TIPOS_COM_RESPOSTA_AUTOMATICA.includes(norm.tipo)) {
              return Response.json(
                { ok: true, conversaId, tipo: norm.tipo, n8n: false },
                { headers: CORS },
              );
            }

            // 6) Notifica o n8n se a IA estiver ativa.
            // IMPORTANTE: no runtime Cloudflare Worker, promises não-aguardadas
            // são canceladas ao retornar a resposta. Por isso AGUARDAMOS o fetch
            // (com timeout curto) em vez de fire-and-forget.
            const n8nUrl = process.env.N8N_WEBHOOK_URL;
            const n8nSecret = process.env.N8N_SECRET;
            console.log("[n8n-notify] secrets", {
              hasUrl: !!n8nUrl,
              hasSecret: !!n8nSecret,
            });
            if (n8nUrl && n8nSecret) {
              const { data: conv } = await supabaseAdmin
                .from("whatsapp_conversas")
                .select("id, phone, lead_id, ia_ativa, status")
                .eq("id", conversaId)
                .maybeSingle();
              console.log("[n8n-notify] conv state", {
                conversaId,
                ia_ativa: conv?.ia_ativa,
                status: conv?.status,
              });
              if (conv && conv.ia_ativa && conv.status === "ia_atendendo") {
                const { data: hist } = await supabaseAdmin
                  .from("whatsapp_mensagens")
                  .select("autor, conteudo, created_at")
                  .eq("conversa_id", conversaId)
                  .order("created_at", { ascending: false })
                  .limit(20);
                const historico = (hist ?? []).slice().reverse();
                const payloadOut = {
                  conversa_id: conv.id,
                  phone: conv.phone,
                  lead_id: conv.lead_id,
                  historico,
                };
                try {
                  const ctrl = new AbortController();
                  const timer = setTimeout(() => ctrl.abort(), 3000);
                  const r = await fetch(n8nUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-n8n-secret": n8nSecret,
                    },
                    body: JSON.stringify(payloadOut),
                    signal: ctrl.signal,
                  });
                  clearTimeout(timer);
                  console.log("[n8n-notify] sent", {
                    conversaId,
                    status: r.status,
                  });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.error("[n8n-notify] failed:", msg);
                }
              }
            }
          }

          return Response.json({ ok: true, conversaId }, { headers: CORS });

        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("zapi webhook error:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
