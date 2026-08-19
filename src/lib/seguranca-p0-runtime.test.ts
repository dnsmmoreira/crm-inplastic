/**
 * Testes de COMPORTAMENTO em tempo de execução do P0 de segurança.
 *
 * Complementa (não substitui) `seguranca-p0.test.ts`, que prova por leitura do
 * código-fonte. Aqui os handlers de cron são realmente invocados, com
 * `supabaseAdmin` e os canais de notificação mockados, para provar que:
 *   • autenticação acontece ANTES de qualquer acesso a dados;
 *   • `apikey` publishable não autentica;
 *   • segredo ausente → 503, errado → 401, correto → prossegue;
 *   • `force`/`dryRun` de query string são ignorados;
 *   • a resposta de cron nunca vaza strings/UUIDs/planos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const HEX32 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

/** Registra QUALQUER toque no cliente admin do banco. */
const spies = vi.hoisted(() => ({ adminHits: [] as string[] }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy(
    {},
    {
      get(_t, prop) {
        spies.adminHits.push(String(prop));
        return () => undefined;
      },
    },
  ),
}));

vi.mock("@/lib/xerife/notify.server", () => ({
  notifyOwner: vi.fn(async () => true),
  notifyDiretoria: vi.fn(async () => true),
  notifyUser: vi.fn(async () => true),
  crmLeadLink: vi.fn(() => "https://example.test/lead"),
}));

vi.mock("@/lib/xerife/watchdog-conversa.server", () => ({
  runWatchdogConversa: vi.fn(async () => ({ avaliadas: 1, notificadas: 0 })),
}));

vi.mock("@/lib/ia-fila.server", () => ({
  processarRespostasPendentes: vi.fn(async () => ({ enviadas: 0 })),
}));

vi.mock("@/lib/telegram-send.server", () => ({
  sendTelegram: vi.fn(async () => true),
  telegramSendMessage: vi.fn(async () => true),
}));

vi.mock("@/lib/whatsapp-send.server", () => ({
  sendWhatsappMessage: vi.fn(async () => ({ ok: true })),
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;

const HOOKS: Array<{ nome: string; carregar: () => Promise<Handler> }> = [
  ["xerife", () => import("@/routes/api/public/hooks/xerife")],
  ["xerife-engine", () => import("@/routes/api/public/hooks/xerife-engine")],
  ["xerife-checkpoint", () => import("@/routes/api/public/hooks/xerife-checkpoint")],
  ["xerife-fechamento", () => import("@/routes/api/public/hooks/xerife-fechamento")],
  ["xerife-agenda-diaria", () => import("@/routes/api/public/hooks/xerife-agenda-diaria")],
  ["xerife-pedidos", () => import("@/routes/api/public/hooks/xerife-pedidos")],
  [
    "xerife-watchdog-conversa",
    () => import("@/routes/api/public/hooks/xerife-watchdog-conversa"),
  ],
  ["ia-fila-envio", () => import("@/routes/api/public/hooks/ia-fila-envio")],
].map(([nome, imp]) => ({
  nome: nome as string,
  carregar: async () => {
    const mod = (await (imp as () => Promise<{ Route: unknown }>)()) as {
      Route: { options: { server: { handlers: { POST: Handler } } } };
    };
    return mod.Route.options.server.handlers.POST;
  },
}));

function req(headers: Record<string, string> = {}, url = "https://app.test/api/public/hooks/x") {
  return new Request(url, { method: "POST", headers });
}

const originalSecret = process.env.XERIFE_SECRET;
beforeEach(() => {
  process.env.XERIFE_SECRET = HEX32;
  spies.adminHits.length = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.XERIFE_SECRET;
  else process.env.XERIFE_SECRET = originalSecret;
});

async function notify() {
  return await import("@/lib/xerife/notify.server");
}

describe("apikey publishable nunca autentica um hook de cron", () => {
  for (const hook of HOOKS) {
    it(`${hook.nome} → 401 e zero acesso a dados`, async () => {
      const POST = await hook.carregar();
      const res = await POST({
        request: req({ apikey: "sb_publishable_3n5tJMHnnkUDeiXHOOvkgQ_9jawnyif" }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
      expect(spies.adminHits).toEqual([]);

      const n = await notify();
      expect(n.notifyOwner).toHaveBeenCalledTimes(0);
      expect(n.notifyDiretoria).toHaveBeenCalledTimes(0);
    });
  }
});

describe("estados do segredo do servidor", () => {
  it("XERIFE_SECRET ausente → 503 sem tocar no banco", async () => {
    delete process.env.XERIFE_SECRET;
    const POST = await HOOKS[0]!.carregar();
    const res = await POST({ request: req({ "x-xerife-secret": HEX32 }) });
    expect(res.status).toBe(503);
    expect(spies.adminHits).toEqual([]);
  });

  it("segredo errado → 401 sem tocar no banco", async () => {
    const POST = await HOOKS[0]!.carregar();
    const res = await POST({ request: req({ "x-xerife-secret": "b".repeat(64) }) });
    expect(res.status).toBe(401);
    expect(spies.adminHits).toEqual([]);
  });

  it("segredo correto → o handler prossegue e chama o motor", async () => {
    const POST = await HOOKS.find((h) => h.nome === "ia-fila-envio")!.carregar();
    const res = await POST({ request: req({ "x-xerife-secret": HEX32 }) });
    expect(res.status).toBe(200);
    const { processarRespostasPendentes } = await import("@/lib/ia-fila.server");
    expect(processarRespostasPendentes).toHaveBeenCalledTimes(1);
  });
});

describe("force/dryRun de query string são ignorados", () => {
  it("xerife-watchdog-conversa invoca o motor com force:false e dryRun:false", async () => {
    const POST = await HOOKS.find((h) => h.nome === "xerife-watchdog-conversa")!.carregar();
    const res = await POST({
      request: req(
        { "x-xerife-secret": HEX32 },
        "https://app.test/api/public/hooks/xerife-watchdog-conversa?force=true&dryRun=true",
      ),
    });
    expect(res.status).toBe(200);
    const { runWatchdogConversa } = await import("@/lib/xerife/watchdog-conversa.server");
    expect(runWatchdogConversa).toHaveBeenCalledWith({ force: false, dryRun: false });
  });

  it("ia-fila-envio ignora force/dryRun (motor chamado sem argumentos)", async () => {
    const POST = await HOOKS.find((h) => h.nome === "ia-fila-envio")!.carregar();
    await POST({
      request: req(
        { "x-xerife-secret": HEX32 },
        "https://app.test/api/public/hooks/ia-fila-envio?force=true&dryRun=true",
      ),
    });
    const { processarRespostasPendentes } = await import("@/lib/ia-fila.server");
    expect(processarRespostasPendentes).toHaveBeenCalledWith();
  });
});

describe("cronJsonResponse não vaza dados", () => {
  it("descarta strings, UUIDs, objetos e arrays de plano", async () => {
    const { cronJsonResponse } = await import("@/lib/xerife/cron-auth.server");
    const res = cronJsonResponse({
      leadId: "6f2b9a2e-1d3c-4c9a-9f45-2b1e6a7c8d90",
      cliente: "Padaria do Denis",
      mensagemInterna: "falha ao enviar para o vendedor João",
      plan: [{ acao: "cobrar", leadId: "6f2b9a2e-1d3c-4c9a-9f45-2b1e6a7c8d90" }],
      criadas: 3,
      dryRun: false,
    });

    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain("6f2b9a2e");
    expect(body).not.toContain("Padaria");
    expect(body).not.toContain("João");
    expect(body).not.toContain("cobrar");
    expect(JSON.parse(body)).toEqual({ ok: true, criadas: 3, dryRun: false, plan_count: 1 });
  });
});

describe("concluirTrocaSenha sem contexto autenticado", () => {
  it("nunca chega a alterar a senha", async () => {
    const { concluirTrocaSenha } = await import("./usuarios.functions");
    await expect(
      (concluirTrocaSenha as unknown as (o: unknown) => Promise<unknown>)({
        data: { password: "Senha!Forte#2026" },
      }),
    ).rejects.toBeDefined();
    // Nenhum toque no cliente admin ⇒ nenhuma chamada a auth.admin.updateUserById.
    expect(spies.adminHits).toEqual([]);
  });
});
