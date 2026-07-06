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

          // Ignora mensagens enviadas por nós mesmos e mensagens de grupo
          if (payload.fromMe || payload.isGroup) {
            return Response.json({ ok: true, ignored: true }, { headers: CORS });
          }

          const phoneRaw = payload.phone ?? "";
          const phone = onlyDigits(phoneRaw);
          const message =
            payload.text?.message ??
            payload.message ??
            "";

          if (!phone || !message) {
            return Response.json({ ok: true, skipped: "no-text" }, { headers: CORS });
          }

          const name = payload.senderName || payload.chatName || null;
          const externalId = typeof payload.messageId === "string" ? payload.messageId : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rawJson = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

          // 1) Log bruto
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

          // 2) Upsert conversa por telefone
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

          // 3) Grava a mensagem do cliente
          if (conversaId) {
            const { error: msgErr } = await supabaseAdmin
              .from("whatsapp_mensagens")
              .insert({
                conversa_id: conversaId,
                direcao: "entrada",
                autor: "cliente",
                conteudo: message,
                external_id: externalId,
              });
            if (msgErr) {
              console.error("whatsapp_mensagens insert failed:", msgErr);
            }

            // 4) Notifica o n8n (fire-and-forget) se a IA estiver ativa.
            const n8nUrl = process.env.N8N_WEBHOOK_URL;
            const n8nSecret = process.env.N8N_SECRET;
            if (n8nUrl && n8nSecret) {
              const { data: conv } = await supabaseAdmin
                .from("whatsapp_conversas")
                .select("id, phone, lead_id, ia_ativa, status")
                .eq("id", conversaId)
                .maybeSingle();
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
                // fire-and-forget — não bloqueia a resposta ao Z-API
                void fetch(n8nUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-n8n-secret": n8nSecret,
                  },
                  body: JSON.stringify(payloadOut),
                }).catch((e) => console.error("n8n notify failed:", e));
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
