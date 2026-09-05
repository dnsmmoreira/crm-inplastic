/**
 * (Cloud API) Webhook oficial da Meta — verificação (GET) e eventos (POST).
 * Mensagens de texto reaproveitam o MESMO pipeline de entrada do webhook Z-API
 * (`processarEntradaWhatsapp`). Nenhuma regra de negócio é duplicada aqui.
 */
import { createFileRoute } from "@tanstack/react-router";
import { registrarFalhaSegura } from "@/lib/guard-erros";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Hub-Signature-256",
} as const;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function mascararTelefoneLog(s: string) {
  const d = onlyDigits(s);
  return d ? `****${d.slice(-4)}` : "****";
}

function compararTempoConstante(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const tamanho = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < tamanho; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, corpo: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpo));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type CloudValue = {
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
};

export const Route = createFileRoute("/api/public/hooks/whatsapp-cloud")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      HEAD: async () => new Response(null, { status: 200, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const tokenRecebido = url.searchParams.get("hub.verify_token") ?? "";
        const token = tokenRecebido.trim();
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const secretEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
        const esperado = (secretEsperado ?? "").trim();

        if (mode === "subscribe" && esperado && compararTempoConstante(token, esperado)) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        if (mode !== "subscribe") {
          console.warn("[wa-cloud-webhook] verificação recusada motivo=modo_invalido");
        } else if (!secretEsperado || !esperado) {
          console.warn("[wa-cloud-webhook] verificação recusada motivo=secret_ausente");
        } else {
          console.warn("[wa-cloud-webhook] verificação recusada motivo=token_divergente", {
            len_esperado: secretEsperado.length,
            len_recebido: tokenRecebido.length,
            igual_apos_trim: compararTempoConstante(tokenRecebido.trim(), secretEsperado.trim()),
          });
        }
        return new Response("Forbidden", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        });
      },

      POST: async ({ request }) => {
        const corpo = await request.text();

        // Assinatura HMAC do corpo cru.
        const appSecret = (process.env.META_APP_SECRET ?? "").trim();
        if (appSecret) {
          const header = (request.headers.get("x-hub-signature-256") ?? "").trim();
          const recebida = header.startsWith("sha256=") ? header.slice(7) : header;
          const esperada = await hmacSha256Hex(appSecret, corpo);
          if (!recebida || !compararTempoConstante(recebida, esperada)) {
            console.warn("[wa-cloud-webhook] assinatura inválida", {
              header_presente: header.length > 0,
              header_com_prefixo_sha256: header.startsWith("sha256="),
              len_assinatura_recebida: recebida.length,
              len_assinatura_esperada: esperada.length,
              len_app_secret: appSecret.length,
              app_secret_so_hex: /^[0-9a-f]+$/i.test(appSecret),
              len_corpo: corpo.length,
            });
            return new Response(JSON.stringify({ ok: false }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
        } else {
          console.warn("[wa-cloud-webhook] META_APP_SECRET ausente — assinatura NÃO verificada");
        }

        try {
          const payload = JSON.parse(corpo || "{}") as {
            entry?: Array<{ id?: string; changes?: Array<{ value?: CloudValue }> }>;
          };

          // --- Guarda de payload de teste do painel da Meta ---
          const aceitarTeste = (process.env.META_ACEITAR_TESTE ?? "").trim() === "true";
          if (!aceitarTeste) {
            const phoneNumberIdCfg = (process.env.META_PHONE_NUMBER_ID ?? "").trim();
            const wabaIdCfg = (process.env.META_WABA_ID ?? "").trim();

            let phone_number_id_confere = true;
            let waba_id_confere = true;
            let numero_de_amostra = false;

            for (const entry of payload.entry ?? []) {
              const entryId = String(entry.id ?? "").trim();
              if (wabaIdCfg && entryId && entryId !== wabaIdCfg) waba_id_confere = false;
              for (const change of entry.changes ?? []) {
                const value = (change.value ?? {}) as CloudValue & {
                  metadata?: { phone_number_id?: string };
                };
                const pnid = String(value.metadata?.phone_number_id ?? "").trim();
                if (phoneNumberIdCfg && pnid && pnid !== phoneNumberIdCfg) {
                  phone_number_id_confere = false;
                }
                for (const c of value.contacts ?? []) {
                  if (onlyDigits(String(c?.wa_id ?? "")) === "16505551111")
                    numero_de_amostra = true;
                }
                for (const m of value.messages ?? []) {
                  if (onlyDigits(String(m["from"] ?? "")) === "16505551111")
                    numero_de_amostra = true;
                }
              }
            }

            if (!phone_number_id_confere || !waba_id_confere || numero_de_amostra) {
              console.warn("WA-CLOUD teste_meta ignorado", {
                phone_number_id_confere,
                waba_id_confere,
                numero_de_amostra,
              });
              return Response.json({ ok: true }, { headers: CORS });
            }
          }

          let qtd_mensagens = 0;
          let qtd_statuses = 0;
          let qtd_errors = 0;
          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              const value = (change.value ?? {}) as CloudValue & {
                errors?: Array<Record<string, unknown>>;
              };
              qtd_mensagens += value.messages?.length ?? 0;
              qtd_statuses += value.statuses?.length ?? 0;
              qtd_errors += value.errors?.length ?? 0;
            }
          }
          console.warn("WA-CLOUD webhook recebido", {
            qtd_entries: payload.entry?.length ?? 0,
            qtd_mensagens,
            qtd_statuses,
            qtd_errors,
          });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              const value = change.value ?? {};
              const nomeContato = value.contacts?.[0]?.profile?.name ?? null;

              // --- statuses (entrega/leitura/falha) ---
              for (const st of value.statuses ?? []) {
                const waId = typeof st["id"] === "string" ? (st["id"] as string) : null;
                const erros = Array.isArray(st["errors"])
                  ? (st["errors"] as Array<Record<string, unknown>>)
                  : [];
                const err0 = erros[0];
                console.warn("WA-CLOUD status", {
                  status: st["status"] ?? null,
                  erro_codigo: err0?.["code"] ?? null,
                  erro_titulo: err0?.["title"] ?? null,
                  erro_detalhe:
                    (err0?.["error_data"] as { details?: unknown } | undefined)?.details ?? null,
                  tem_wamid: Boolean(waId),
                });
                const phone =
                  typeof st["recipient_id"] === "string"
                    ? onlyDigits(st["recipient_id"] as string)
                    : null;
                // REGISTRAR E SEGUIR: status é telemetria e a Meta reentrega em
                // 5xx o LOTE inteiro — devolver erro reprocessaria mensagens já
                // tratadas. Registra com o wa_message_id para reconciliar.
                const upStatus = await supabaseAdmin.from("wa_cloud_eventos").upsert(
                  {
                    tipo: `status_${String(st["status"] ?? "desconhecido")}`,
                    wa_message_id: waId ? `status:${waId}:${String(st["status"] ?? "")}` : null,
                    phone,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    payload: st as any,
                    processado: true,
                  },
                  { onConflict: "wa_message_id", ignoreDuplicates: true },
                );
                if (upStatus.error) {
                  await registrarFalhaSegura("wa-cloud-webhook.status", upStatus.error, {
                    wa_message_id: waId,
                    status: st["status"] ?? null,
                  });
                }
              }

              // --- messages (entrada) ---
              for (const msg of value.messages ?? []) {
                const waId = typeof msg["id"] === "string" ? (msg["id"] as string) : null;
                const phone = onlyDigits(String(msg["from"] ?? ""));
                const tipoBruto = String(msg["type"] ?? "desconhecido");

                // Idempotência por wa_message_id.
                if (waId) {
                  const { data: ja } = await supabaseAdmin
                    .from("wa_cloud_eventos")
                    .select("id")
                    .eq("wa_message_id", waId)
                    .maybeSingle();
                  if (ja?.id) {
                    console.warn(
                      `[wa-cloud-webhook] evento duplicado ignorado phone=${mascararTelefoneLog(phone)}`,
                    );
                    continue;
                  }
                }

                const { error: evErr } = await supabaseAdmin.from("wa_cloud_eventos").insert({
                  tipo: `mensagem_${tipoBruto}`,
                  wa_message_id: waId,
                  phone,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  payload: msg as any,
                });
                if (evErr && evErr.code === "23505") continue;
                if (evErr) {
                  // REGISTRAR E SEGUIR: o pipeline abaixo ainda pode processar a
                  // mensagem; a Meta reentrega o lote inteiro em 5xx.
                  console.error("wa_cloud_eventos insert failed:", evErr);
                  await registrarFalhaSegura("wa-cloud-webhook.evento", evErr, {
                    wa_message_id: waId,
                    tipo: tipoBruto,
                  });
                }

                if (!phone) continue;

                const { processarMensagemCloud } = await import(
                  "@/lib/whatsapp-cloud-entrada.server"
                );
                try {
                  const r = await processarMensagemCloud({
                    msg,
                    phone,
                    nomeContato,
                    waMessageId: waId,
                    tag: "wa-cloud-webhook",
                  });
                  console.warn(
                    `[wa-cloud-webhook] tipo=${tipoBruto}→${r.tipo} midia_ok=${r.midiaOk} phone=${mascararTelefoneLog(phone)}`,
                  );
                  if (waId) {
                    // REGISTRAR E SEGUIR: a mensagem já foi processada; a marca
                    // de "processado" é só idempotência. Mídia que não baixou
                    // fica pendente para o reprocessamento do backlog.
                    const marcado = await supabaseAdmin
                      .from("wa_cloud_eventos")
                      .update(
                        r.midiaOk
                          ? { processado: true }
                          : { processado: false, erro: (r.erro ?? "download_falhou").slice(0, 500) },
                      )
                      .eq("wa_message_id", waId);
                    if (marcado.error) {
                      await registrarFalhaSegura(
                        "wa-cloud-webhook.marcarProcessado",
                        marcado.error,
                        {
                          wa_message_id: waId,
                        },
                      );
                    }
                  }

                } catch (e) {
                  const m = e instanceof Error ? e.message : String(e);
                  console.error(`[wa-cloud-webhook] pipeline falhou: ${m}`);
                  await registrarFalhaSegura("wa-cloud-webhook.pipeline", e, {
                    wa_message_id: waId,
                    phone_mascarado: mascararTelefoneLog(phone),
                  });
                  if (waId) {
                    const marcadoErro = await supabaseAdmin
                      .from("wa_cloud_eventos")
                      .update({ erro: m.slice(0, 500) })
                      .eq("wa_message_id", waId);
                    if (marcadoErro.error) {
                      await registrarFalhaSegura("wa-cloud-webhook.marcarErro", marcadoErro.error, {
                        wa_message_id: waId,
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // REGISTRAR E SEGUIR: a Meta exige 200; erro aqui vira incidente.
          console.error("[wa-cloud-webhook] erro:", e instanceof Error ? e.message : String(e));
          await registrarFalhaSegura("wa-cloud-webhook.lote", e);
        }

        // A Meta exige 200 rápido sempre.
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
