import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

/** Mascara telefone para logs: apenas os 4 ultimos digitos (ex.: ****7690). */
function mascararTelefoneLog(s: string) {
  const d = onlyDigits(s);
  return d ? `****${d.slice(-4)}` : "****";
}

/** Comparação em tempo constante (evita timing attack). Nunca loga valores. */
function compararTempoConstante(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const tamanho = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < tamanho; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
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
  instanceId?: string;

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
/** Resposta generica para metodos nao suportados (sem vazar informacao). */
function metodoNaoPermitido() {
  return new Response(JSON.stringify({ ok: false }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/zapi/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => metodoNaoPermitido(),
      PUT: async () => metodoNaoPermitido(),
      PATCH: async () => metodoNaoPermitido(),
      DELETE: async () => metodoNaoPermitido(),
      HEAD: async () => metodoNaoPermitido(),
      POST: async ({ request }) => {
        // --- Autenticação do webhook (B1..B4) ---
        const secret = (process.env.ZAPI_WEBHOOK_SECRET ?? "").trim();
        if (!secret) {
          console.error("ZAPI_WEBHOOK_SECRET ausente");
          return new Response(JSON.stringify({ ok: false }), {
            status: 503,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const url = new URL(request.url);
        const tokenRecebido =
          (url.searchParams.get("token") ?? request.headers.get("x-zapi-token") ?? "").trim();

        if (!tokenRecebido || !compararTempoConstante(tokenRecebido, secret)) {
          const origem =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for") ??
            request.headers.get("origin") ??
            "desconhecida";
          console.warn(`[zapi-webhook] token inválido — origem=${origem}`);
          return new Response(JSON.stringify({ ok: false }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const payload = (await request.json()) as ZapiPayload;

          const instanciaEsperada = (process.env.ZAPI_INSTANCE_ID ?? "").trim();
          const instanciaRecebida =
            typeof payload.instanceId === "string" ? payload.instanceId.trim() : "";
          if (instanciaRecebida && instanciaEsperada && instanciaRecebida !== instanciaEsperada) {
            console.warn("[zapi-webhook] instanceId não corresponde à instância configurada");
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }


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

            // 5a) Opt-out pedido pelo contato ("sair", "parar", ...).
            {
              const { normalizarTexto } = await import("@/lib/zapi-send.server");
              const txt = normalizarTexto(message);
              const gatilhos = ["sair", "parar", "pare", "descadastrar", "nao quero", "me tira"];
              if (gatilhos.some((g) => txt === g || txt.startsWith(g))) {
                const { error: ooErr } = await supabaseAdmin
                  .from("whatsapp_optout")
                  .upsert({ phone, motivo: "pedido do contato" }, { onConflict: "phone" });
                if (ooErr) console.error("optout upsert failed:", ooErr);
                await supabaseAdmin
                  .from("whatsapp_conversas")
                  .update({ ia_ativa: false })
                  .eq("id", conversaId);
                console.warn(`[zapi:comercial:webhook] OPT-OUT registrado phone=${mascararTelefoneLog(phone)}`);
                return Response.json({ ok: true, conversaId, optout: true }, { headers: CORS });
              }
            }


            // 5b) Handoff humano para mídia/tipos não conversáveis.
            //     Além do estado no banco, avisa o responsável (ou admin) —
            //     nunca marcar a flag em silêncio.
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

              const { data: convHo } = await supabaseAdmin
                .from("whatsapp_conversas")
                .select("id, phone, name, atribuido_para, lead_id")
                .eq("id", conversaId)
                .maybeSingle();
              const quem = convHo?.name?.trim() || convHo?.phone || phone;
              const titulo = `Mídia (${norm.tipo}) aguardando atendimento — ${quem}`;
              const { notificarUsuario, alertarAdmins } = await import(
                "@/lib/xerife/handoff.server"
              );
              if (convHo?.atribuido_para) {
                await notificarUsuario(supabaseAdmin, {
                  userId: convHo.atribuido_para,
                  tipo: "handoff_midia",
                  titulo,
                  conversaId,
                });
                const { notifyOwner } = await import("@/lib/xerife/notify.server");
                await notifyOwner(
                  convHo.atribuido_para,
                  `📎 Conversa aguardando atendimento humano\n\nCliente: ${quem}\nMotivo: mídia recebida (${norm.tipo}) — a IA foi desligada.`,
                );
              } else {
                await alertarAdmins(supabaseAdmin, {
                  tipo: "handoff_midia",
                  titulo,
                  conversaId,
                  mensagem: `📎 Conversa SEM responsável aguardando atendimento humano\n\nCliente: ${quem}\nMotivo: mídia recebida (${norm.tipo}) — a IA foi desligada.`,
                });
              }

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
                const { enviarAvisoN8n, enfileirarAvisoN8n, N8N_TIMEOUT_MS } = await import(
                  "@/lib/n8n-fila.server"
                );
                try {
                  await enviarAvisoN8n(n8nUrl, n8nSecret, payloadOut, N8N_TIMEOUT_MS);
                  console.log("[n8n-notify] sent", { conversaId });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.error("[n8n-notify] failed, enfileirando reenvio:", msg);
                  await enfileirarAvisoN8n(supabaseAdmin, {
                    conversaId,
                    payload: payloadOut,
                    erro: msg,
                  });
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
