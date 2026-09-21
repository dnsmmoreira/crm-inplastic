/**
 * Xerife Humano — o auditor LÊ a conversa da equipe (`whatsapp.ver_equipe`),
 * mas não pode escrever. Como a visibilidade deixou de ser a proteção, toda
 * ação de escrita precisa chamar a guarda explícita.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertPodeAtuarNaConversa,
  assertPodeAtender,
  MSG_SOMENTE_LEITURA,
} from "./whatsapp-guard";

vi.mock("@/lib/guard-erros", () => ({
  registrarFalhaSegura: async () => undefined,
}));

const sbCom = (valor: unknown, error: unknown = null) => ({
  rpc: async () => ({ data: valor, error }),
});

describe("guarda de escrita no WhatsApp", () => {
  it("libera quem pode atuar na conversa", async () => {
    await expect(assertPodeAtuarNaConversa(sbCom(true), "c1")).resolves.toBeUndefined();
  });

  it("recusa quem só tem leitura (auditor)", async () => {
    await expect(assertPodeAtuarNaConversa(sbCom(false), "c1")).rejects.toThrow(
      MSG_SOMENTE_LEITURA,
    );
  });

  it("recusa quando o banco não responde", async () => {
    await expect(
      assertPodeAtuarNaConversa(sbCom(null, { message: "x" }), "c1"),
    ).rejects.toThrow(/confirmar o seu acesso/i);
  });

  it("iniciar conversa exige a permissão de atender", async () => {
    await expect(assertPodeAtender(sbCom(true), "u1")).resolves.toBeUndefined();
    await expect(assertPodeAtender(sbCom(false), "u1")).rejects.toThrow(
      /não tem permissão para iniciar conversas/i,
    );
  });
});

function corpoDaFuncao(arquivo: string, nome: string): string {
  const src = readFileSync(arquivo, "utf8");
  const i = src.indexOf(`export const ${nome} = createServerFn`);
  expect(i, `${nome} não encontrada em ${arquivo}`).toBeGreaterThan(-1);
  const prox = src.indexOf("\nexport const ", i + 10);
  return src.slice(i, prox === -1 ? src.length : prox);
}

const ESCREVEM: Array<[string, string]> = [
  ["src/lib/canais.functions.ts", "sendConversaMessage"],
  ["src/lib/canais.functions.ts", "sendConversaAnexo"],
  ["src/lib/canais.functions.ts", "enviarTemplateConversa"],
  ["src/lib/canais.functions.ts", "createLeadFromConversa"],
  ["src/lib/assistente-redacao.functions.ts", "assistenteRedacao"],
];

const SO_LEEM: Array<[string, string]> = [
  ["src/lib/canais.functions.ts", "posseConversa"],
  ["src/lib/canais.functions.ts", "statusJanelaConversa"],
];

describe("quem exige a guarda", () => {
  it.each(ESCREVEM)("%s → %s exige poder atuar na conversa", (arquivo, nome) => {
    expect(corpoDaFuncao(arquivo, nome)).toContain("assertPodeAtuarNaConversa(supabase");
  });

  it("iniciarConversaCliente exige a permissão de atender", () => {
    expect(corpoDaFuncao("src/lib/canais.functions.ts", "iniciarConversaCliente")).toContain(
      "assertPodeAtender(supabase",
    );
  });

  it.each(SO_LEEM)("%s → %s NÃO bloqueia o auditor", (arquivo, nome) => {
    const corpo = corpoDaFuncao(arquivo, nome);
    expect(corpo).not.toContain("assertPodeAtuarNaConversa");
    expect(corpo).not.toContain("assertPodeAtender");
  });

  it.each([
    "assumirConversa",
    "devolverParaIA",
    "encerrarConversa",
    "transferirConversa",
    "colocarConversaEmEspera",
    "retomarConversa",
  ])("%s continua protegida", (nome) => {
    expect(corpoDaFuncao("src/lib/atendimento.functions.ts", nome)).toContain(
      "assertPodeAtuarNaConversa(supabase",
    );
  });
});
