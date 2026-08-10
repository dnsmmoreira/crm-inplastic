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

          const { normalizarPayloadZapi } = await import("@/lib/zapi-normalize");
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

          // 2) Filtros de processamento (após o registro bruto).
          if (payload.fromMe || payload.isGroup) {
            return Response.json({ ok: true, ignored: true }, { headers: CORS });
          }

          // 3) Pipeline de entrada compartilhado (mesmo usado pelo Cloud API).
          const { processarEntradaWhatsapp } = await import("@/lib/whatsapp-inbound.server");
          const resultado = await processarEntradaWhatsapp({
            phone,
            message,
            name,
            externalId,
            tipo: norm.tipo,
            midia: norm.midia ?? null,
            tag: "zapi-webhook",
          });

          return Response.json(resultado, { headers: CORS });


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
