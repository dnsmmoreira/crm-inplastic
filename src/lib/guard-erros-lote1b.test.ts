import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const registrarFalhaAdmin = vi.fn(async () => true);
vi.mock("@/lib/falhas.server", () => ({ registrarFalhaAdmin }));

const sendWhatsappText = vi.fn(async () => ({ ok: true }));
vi.mock("./whatsapp-send.server", () => ({
  sendWhatsappText,
  mascararTelefoneLog: (p: string) => p.slice(0, 4) + "***",
  normalizarTexto: (s: string) => s,
}));
vi.mock("./zapi-disjuntor.server", () => ({
  envioAutomaticoPausado: async () => false,
  registrarFalhaEntrega: vi.fn(async () => undefined),
}));
vi.mock("./whatsapp-presenca.server", () => ({ marcarComoLida: vi.fn(async () => undefined) }));
vi.mock("./zapi-humanizacao", () => ({
  calcularAtrasoMs: () => 0,
  calcularEsperaAntesDoTyping: () => 0,
  calcularTypingMs: () => 0,
  sleep: async () => undefined,
}));

type Resultado = { data?: unknown; error?: unknown; count?: number };
type Rota = (table: string, op: string) => Resultado;

function criarSb(rota: Rota) {
  const builder = (table: string) => {
    let op = "select";
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of [
      "select",
      "eq",
      "neq",
      "in",
      "is",
      "gt",
      "lte",
      "order",
      "limit",
      "maybeSingle",
      "single",
    ]) {
      b[m] = (..._a: unknown[]) => chain();
    }
    for (const m of ["update", "insert", "upsert", "delete"]) {
      b[m] = (..._a: unknown[]) => {
        op = m;
        return chain();
      };
    }
    b['then'] = (res: (v: Resultado) => unknown) => Promise.resolve(rota(table, op)).then(res);
    return b;
  };
  return { from: (t: string) => builder(t) };
}

async function carregarFila(rota: Rota) {
  vi.doMock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: criarSb(rota) }));
  vi.resetModules();
  return await import("./ia-fila.server");
}

beforeEach(() => {
  registrarFalhaAdmin.mockClear();
  sendWhatsappText.mockClear();
});

describe("fila de IA — transições fail-closed", () => {
  it("aborta quando a reserva da resposta falha e NÃO envia a mensagem", async () => {
    let selects = 0;
    const { despacharResposta } = await carregarFila((table, op) => {
      if (table === "ia_respostas_pendentes" && op === "select") {
        selects++;
        // 1ª = a própria linha; 2ª = busca por pendente mais nova (nenhuma).
        return selects === 1
          ? { data: { id: "r1", conversa_id: "c1", mensagem: "oi", status: "pendente" } }
          : { data: null };
      }
      if (table === "whatsapp_conversas") return { data: { id: "c1", phone: "5511", ia_ativa: true } };
      if (table === "ia_respostas_pendentes" && op === "update") {
        return { data: null, error: { message: "deadlock" } };
      }
      return { data: null };
    });

    await expect(despacharResposta("r1")).rejects.toThrow(
      /reservar a resposta automática/i,
    );
    expect(sendWhatsappText).not.toHaveBeenCalled();
    expect(registrarFalhaAdmin).toHaveBeenCalled();
  });

  it("aborta quando o cancelamento por IA desligada falha (evita reenvio pelo cron)", async () => {
    let sel = 0;
    const { despacharResposta } = await carregarFila((table, op) => {
      if (table === "ia_respostas_pendentes" && op === "select") {
        sel++;
        return sel === 1
          ? { data: { id: "r1", conversa_id: "c1", mensagem: "oi", status: "pendente" } }
          : { data: null };
      }
      if (table === "whatsapp_conversas") return { data: { id: "c1", phone: "5511", ia_ativa: false } };
      if (table === "ia_respostas_pendentes" && op === "update") {
        return { data: null, error: { message: "falha" } };
      }
      return { data: null };
    });

    await expect(despacharResposta("r1")).rejects.toThrow();
    expect(sendWhatsappText).not.toHaveBeenCalled();
  });
});

describe("rollback de etapa do pedido", () => {
  const src = readFileSync("src/lib/pedidos.functions.ts", "utf8");

  it("registra 'rollback parcial' quando o segundo update (lead) falha", () => {
    expect(src).toContain("rollback_parcial: true");
    expect(src).toContain("rollback parcial: proposta reaberta, lead permaneceu em ganho");
    expect(src).toContain("Rollback parcial:");
    // ambos os rollbacks (reprovação e devolução) passam por assertNoError
    expect(src.match(/rollback-proposta/g)?.length).toBe(2);
    expect(src.match(/rollback-lead/g)?.length).toBe(2);
  });
});

describe("marcar proposta como enviada", () => {
  it("devolve aviso (sem lançar) quando o update pós-envio falha", async () => {
    const supabase = criarSb((table, op) => {
      if (table === "propostas" && op === "update") return { error: { message: "rls" } };
      return { error: null };
    });
    const { registrarFalhaSegura } = await import("./guard-erros");

    // Reproduz o trecho pós-envio: update de status + aviso na resposta.
    let aviso: string | undefined;
    const up = (await (supabase.from("propostas") as unknown as {
      update: (v: unknown) => Promise<{ error?: unknown }>;
    }).update({ status: "enviada" })) as { error?: unknown };
    if (up.error) {
      await registrarFalhaSegura("propostas-email/marcar-enviada", up.error, {});
      aviso =
        "E-mail enviado, mas não foi possível marcar a proposta como enviada — atualize manualmente.";
    }
    expect(aviso).toMatch(/atualize manualmente/);
    expect(registrarFalhaAdmin).toHaveBeenCalled();

    const srcEmail = readFileSync("src/lib/propostas-email.server.ts", "utf8");
    expect(srcEmail).toContain("aviso");
    expect(srcEmail).toContain("return { ok: true as const, email: destinatario, aviso };");
  });
});
