/**
 * Lote 2 — regressão dos webhooks públicos.
 *
 * (a) falha de escrita DEPOIS de aceitar o payload (Meta) → 200 + falha
 *     registrada com o id externo;
 * (b) falha ANTES de qualquer efeito num endpoint que o remetente reentrega
 *     → 500;
 * (c) secret inválido continua 401.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const registrarFalhaAdmin = vi.fn(async () => true);
vi.mock("@/lib/falhas.server", () => ({ registrarFalhaAdmin }));

type Resultado = { data?: unknown; error?: unknown };
type Rota = (table: string, op: string) => Resultado;

function criarSb(rota: Rota) {
  const builder = (table: string) => {
    let op = "select";
    const b: Record<string, unknown> = {};
    const metodos: string[] = ["select", "eq", "in", "is", "limit", "order", "neq"];
    for (const m of metodos) b[m] = () => b;
    for (const m of ["insert", "update", "upsert", "delete"]) {
      b[m] = () => {
        op = m;
        return b;
      };
    }
    b["maybeSingle"] = async () => rota(table, op);
    b["single"] = async () => rota(table, op);
    b["then"] = (res: (v: Resultado) => unknown) => Promise.resolve(rota(table, op)).then(res);
    return b;
  };
  return { from: (t: string) => builder(t) };
}

let sbAtual: ReturnType<typeof criarSb>;
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return sbAtual;
  },
}));

vi.mock("@/lib/whatsapp-inbound.server", () => ({
  processarEntradaWhatsapp: vi.fn(async () => undefined),
}));
vi.mock("@/lib/xerife/handoff.server", () => ({
  notificarUsuario: vi.fn(async () => undefined),
  alertarAdmins: vi.fn(async () => undefined),
}));
vi.mock("@/lib/xerife/notify.server", () => ({
  notifyOwner: vi.fn(async () => undefined),
  crmLeadLink: () => "",
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (rota: any, metodo: string) => rota.options.server.handlers[metodo];

beforeEach(() => {
  registrarFalhaAdmin.mockClear();
  process.env.N8N_SECRET = "s".repeat(20) + "AbC123!@#segredo-forte-para-teste";
  process.env.META_APP_SECRET = "";
  process.env.META_ACEITAR_TESTE = "true";
});

const APP_SECRET_TESTE = "segredo-de-teste-para-hmac-do-webhook-meta-1234";

async function assinar(corpo: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET_TESTE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpo));
  return (
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

const CORPO_META = JSON.stringify({
  entry: [
    {
      id: "waba",
      changes: [
        {
          value: {
            messages: [
              { id: "wamid.TESTE1", from: "5511999999999", type: "text", text: { body: "oi" } },
            ],
          },
        },
      ],
    },
  ],
});

describe("Meta: assinatura obrigatória (SEC-04)", () => {
  it("sem META_APP_SECRET responde 503 e registra a falha", async () => {
    process.env.META_APP_SECRET = "";
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/hooks/whatsapp-cloud");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/hooks/whatsapp-cloud", {
        method: "POST",
        body: CORPO_META,
      }),
    });
    expect(res.status).toBe(503);
    const origens = registrarFalhaAdmin.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(origens).toContain("wa-cloud-webhook.sem_app_secret");
  });

  it("com segredo e assinatura inválida responde 401", async () => {
    process.env.META_APP_SECRET = APP_SECRET_TESTE;
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/hooks/whatsapp-cloud");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/hooks/whatsapp-cloud", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body: CORPO_META,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("com segredo e assinatura válida responde 200", async () => {
    process.env.META_APP_SECRET = APP_SECRET_TESTE;
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/hooks/whatsapp-cloud");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/hooks/whatsapp-cloud", {
        method: "POST",
        headers: { "x-hub-signature-256": await assinar(CORPO_META) },
        body: CORPO_META,
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("(a) Meta: falha de escrita após aceitar o payload", () => {
  it("responde 200 e registra a falha com o wa_message_id", async () => {
    process.env.META_APP_SECRET = APP_SECRET_TESTE;
    sbAtual = criarSb((_t, op) =>
      op === "insert" || op === "upsert" ? { error: { message: "boom" } } : { data: null },
    );
    const { Route } = await import("@/routes/api/public/hooks/whatsapp-cloud");
    const corpo = CORPO_META;
    const req = new Request("https://x/api/public/hooks/whatsapp-cloud", {
      method: "POST",
      headers: { "x-hub-signature-256": await assinar(corpo) },
      body: corpo,
    });
    const res = await handler(Route, "POST")({ request: req });
    expect(res.status).toBe(200);
    const origens = registrarFalhaAdmin.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(origens.some((o) => o.startsWith("wa-cloud-webhook"))).toBe(true);
    const contextos = JSON.stringify(registrarFalhaAdmin.mock.calls);
    expect(contextos).toContain("wamid.TESTE1");
  });
});

describe("(b) n8n: falha antes de qualquer efeito", () => {
  it("responde 500 para permitir reentrega", async () => {
    sbAtual = criarSb((_t, op) =>
      op === "update"
        ? { error: { message: "rls" } }
        : { data: { id: "c1", phone: "5511999999999", name: "Fulano", atribuido_para: null } },
    );
    const { Route } = await import("@/routes/api/public/hooks/ia-handoff");
    const req = new Request("https://x/api/public/hooks/ia-handoff", {
      method: "POST",
      headers: { "x-n8n-secret": process.env.N8N_SECRET as string },
      body: JSON.stringify({ conversa_id: "c1", motivo: "financeiro" }),
    });
    const res = await handler(Route, "POST")({ request: req });
    expect(res.status).toBe(500);
    expect(registrarFalhaAdmin).toHaveBeenCalled();
  });
});

describe("(c) secret inválido", () => {
  it("continua 401", async () => {
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/hooks/ia-handoff");
    const req = new Request("https://x/api/public/hooks/ia-handoff", {
      method: "POST",
      headers: { "x-n8n-secret": "errado" },
      body: JSON.stringify({ conversa_id: "c1", motivo: "financeiro" }),
    });
    const res = await handler(Route, "POST")({ request: req });
    expect(res.status).toBe(401);
  });
});

describe("SEC-13: n8n e Telegram passam a recusar", () => {
  it("requireN8nAuth sem N8N_SECRET responde 503", async () => {
    delete process.env.N8N_SECRET;
    const { requireN8nAuth } = await import("@/lib/n8n-auth.server");
    const res = await requireN8nAuth(new Request("https://x/h", { method: "POST" }));
    expect(res?.status).toBe(503);
  });

  it("requireN8nAuth com header errado responde 401", async () => {
    const { requireN8nAuth } = await import("@/lib/n8n-auth.server");
    const res = await requireN8nAuth(
      new Request("https://x/h", { method: "POST", headers: { "x-n8n-secret": "errado" } }),
    );
    expect(res?.status).toBe(401);
  });

  it("requireN8nAuth com header certo devolve null", async () => {
    const { requireN8nAuth } = await import("@/lib/n8n-auth.server");
    const res = await requireN8nAuth(
      new Request("https://x/h", {
        method: "POST",
        headers: { "x-n8n-secret": process.env.N8N_SECRET as string },
      }),
    );
    expect(res).toBeNull();
  });
});

describe("Telegram webhook: segredo", () => {
  const SEGREDO = "telegram-segredo-forte-para-teste-1234567890";

  it("sem segredo configurado responde 503", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "";
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/telegram/webhook");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/telegram/webhook", { method: "POST" }),
    });
    expect(res.status).toBe(503);
  });

  it("header inválido responde 401 e registra a falha", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SEGREDO;
    sbAtual = criarSb(() => ({ data: null }));
    const { Route } = await import("@/routes/api/public/telegram/webhook");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "errado" },
      }),
    });
    expect(res.status).toBe(401);
    const origens = registrarFalhaAdmin.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(origens).toContain("telegram-webhook.assinatura_invalida");
  });

  it("header válido responde 200 e vincula o perfil", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SEGREDO;
    const updates: string[] = [];
    sbAtual = criarSb((t, op) => {
      if (t === "profiles" && op === "update") {
        updates.push("update");
        return { data: null };
      }
      return { data: { id: "p1" } };
    });
    const { Route } = await import("@/routes/api/public/telegram/webhook");
    const res = await handler(Route, "POST")({
      request: new Request("https://x/api/public/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": SEGREDO },
        body: JSON.stringify({ message: { text: "/start ABC123", chat: { id: 42 } } }),
      }),
    });
    expect(res.status).toBe(200);
    expect(updates.length).toBe(1);
  });
});
