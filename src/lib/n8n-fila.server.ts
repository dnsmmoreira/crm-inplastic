/**
 * Fila de reenvio do aviso ao n8n.
 *
 * Uma indisponibilidade momentânea do n8n não pode engolir a mensagem do
 * cliente: o payload é enfileirado em `n8n_reenvio_fila` e reprocessado pelo
 * cron do Xerife, com limite de tentativas e backoff.
 *
 * Server-only (usa o client admin).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export const N8N_TIMEOUT_MS = 12000;
const BACKOFF_MIN = [1, 5, 15, 60, 180];
const LOTE = 25;

/** POST no n8n com timeout configurável. Lança em erro/timeout/status != 2xx. */
export async function enviarAvisoN8n(
  url: string,
  secret: string,
  payload: unknown,
  timeoutMs = N8N_TIMEOUT_MS,
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-n8n-secret": secret },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`n8n respondeu ${r.status}`);
  } finally {
    clearTimeout(timer);
  }
}

function proximaTentativa(tentativas: number): string {
  const min = BACKOFF_MIN[Math.min(tentativas, BACKOFF_MIN.length - 1)] ?? 180;
  return new Date(Date.now() + min * 60_000).toISOString();
}

/** Guarda o payload para reprocessamento posterior. */
export async function enfileirarAvisoN8n(
  sb: SB,
  params: { conversaId: string | null; payload: unknown; erro: string },
): Promise<void> {
  const { error } = await sb.from("n8n_reenvio_fila").insert({
    conversa_id: params.conversaId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: params.payload as any,
    tentativas: 0,
    status: "pendente",
    ultimo_erro: params.erro,
    proxima_tentativa_em: proximaTentativa(0),
  });
  if (error) {
    console.error("[n8n-fila] falha ao enfileirar:", error.message);
    const { registrarFalhaAdmin } = await import("./falhas.server");
    await registrarFalhaAdmin("n8n.reenvio", error.message, {
      conversa_id: params.conversaId,
      acao: "enfileirar",
      erro_origem: params.erro,
    });
  }
}

export type ResultadoFilaN8n = {
  processados: number;
  reenviados: number;
  falhas: number;
  esgotados: number;
};

/** Reprocessa a fila pendente. Chamado pelo cron do Xerife. */
export async function processarFilaN8n(sb: SB): Promise<ResultadoFilaN8n> {
  const out: ResultadoFilaN8n = { processados: 0, reenviados: 0, falhas: 0, esgotados: 0 };
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_SECRET;
  if (!url || !secret) return out;

  const { data: itens } = await sb
    .from("n8n_reenvio_fila")
    .select("id, payload, tentativas, max_tentativas")
    .eq("status", "pendente")
    .lte("proxima_tentativa_em", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(LOTE);

  for (const item of (itens ?? []) as {
    id: string;
    payload: unknown;
    tentativas: number;
    max_tentativas: number;
  }[]) {
    out.processados++;
    const tentativas = item.tentativas + 1;
    try {
      await enviarAvisoN8n(url, secret, item.payload);
      await sb
        .from("n8n_reenvio_fila")
        .update({ status: "enviado", tentativas, ultimo_erro: null })
        .eq("id", item.id);
      out.reenviados++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const esgotou = tentativas >= item.max_tentativas;
      await sb
        .from("n8n_reenvio_fila")
        .update({
          status: esgotou ? "falhou" : "pendente",
          tentativas,
          ultimo_erro: msg,
          proxima_tentativa_em: proximaTentativa(tentativas),
        })
        .eq("id", item.id);
      if (esgotou) out.esgotados++;
      else out.falhas++;
    }
  }
  return out;
}
