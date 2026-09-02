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

describe("(a) Meta: falha de escrita após aceitar o payload", () => {
  it("responde 200 e registra a falha com o wa_message_id", async () => {
    sbAtual = criarSb((_t, op) =>
      op === "insert" || op === "upsert" ? { error: { message: "boom" } } : { data: null },
    );
    const { Route } = await import("@/routes/api/public/hooks/whatsapp-cloud");
    const req = new Request("https://x/api/public/hooks/whatsapp-cloud", {
      method: "POST",
      body: JSON.stringify({
        entry: [
          {
            id: "waba",
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "wamid.TESTE1",
                      from: "5511999999999",
                      type: "text",
                      text: { body: "oi" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    });
    const res = await handler(Route, "POST")({ request: req });
    expect(res.status).toBe(200);
    const origens = registrarFalhaAdmin.mock.calls.map((c) => String(c[0]));
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
