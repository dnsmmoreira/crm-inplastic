import { describe, expect, it } from "vitest";
import {
  montarListaChat,
  outroDoParChave,
  prepararTexto,
  primeiroNome,
  resumirPorCanal,
  totalNaoLidas,
  validarAnexoChat,
  caminhoAnexoChat,
  ehImagemAnexo,
  formatarTamanhoAnexo,
  anexosChatExpirados,
  ehPdfAnexo,
  mesclarHistorico,
  prepararBusca,
  escaparCuringaBusca,
  type ChatCanalResumo,
} from "./chat-interno";

describe("preview e busca", () => {
  it("reconhece PDF por mime e por extensão", () => {
    expect(ehPdfAnexo("application/pdf")).toBe(true);
    expect(ehPdfAnexo("application/octet-stream", "contrato.PDF")).toBe(true);
    expect(ehPdfAnexo("image/png", "foto.png")).toBe(false);
  });

  it("mescla histórico sem duplicar e em ordem crescente", () => {
    const a = { id: "2", criado_em: "2026-01-02T10:00:00Z" };
    const b = { id: "1", criado_em: "2026-01-01T10:00:00Z" };
    expect(mesclarHistorico([a], [b, a]).map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("recusa termo curto e escapa curingas", () => {
    expect(prepararBusca(" a ")).toBeNull();
    expect(prepararBusca("  nota ")).toBe("nota");
    expect(escaparCuringaBusca("50%_x")).toBe("50\\%\\_x");
  });
});

const EU = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

describe("primeiroNome", () => {
  it("pega só o primeiro nome e tem fallback", () => {
    expect(primeiroNome("Ana Paula Souza")).toBe("Ana");
    expect(primeiroNome("  ")).toBe("Colega");
    expect(primeiroNome(null)).toBe("Colega");
  });
});

describe("outroDoParChave", () => {
  it("devolve o outro participante", () => {
    const chave = [EU, OUTRO].sort().join(":");
    expect(outroDoParChave(chave, EU)).toBe(OUTRO);
    expect(outroDoParChave(chave, OUTRO)).toBe(EU);
    expect(outroDoParChave(null, EU)).toBeNull();
  });
});

describe("resumirPorCanal", () => {
  it("conta não lidas só de outro autor e após o last_read_at", () => {
    const r = resumirPorCanal(
      [
        { canal_id: "c1", conteudo: "oi", criado_em: "2026-01-01T10:00:00Z", autor_user_id: OUTRO },
        { canal_id: "c1", conteudo: "tudo bem?", criado_em: "2026-01-01T12:00:00Z", autor_user_id: OUTRO },
        { canal_id: "c1", conteudo: "minha", criado_em: "2026-01-01T13:00:00Z", autor_user_id: EU },
      ],
      new Map([["c1", "2026-01-01T11:00:00Z"]]),
      EU,
    );
    const c1 = r.get("c1")!;
    expect(c1.naoLidas).toBe(1);
    expect(c1.ultimaTexto).toBe("minha");
  });

  it("sem leitura registrada, tudo do outro conta", () => {
    const r = resumirPorCanal(
      [{ canal_id: "c1", conteudo: "a", criado_em: "2026-01-01T10:00:00Z", autor_user_id: OUTRO }],
      new Map(),
      EU,
    );
    expect(r.get("c1")!.naoLidas).toBe(1);
  });
});

const canaisBase: ChatCanalResumo[] = [
    {
      canalId: "geral",
      tipo: "geral",
      outroUserId: null,
      lastReadAt: null,
      ultimaMensagemEm: "2026-01-01T09:00:00Z",
      ultimaMensagemTexto: "bom dia",
      naoLidas: 2,
    },
    {
      canalId: "d1",
      tipo: "direto",
      outroUserId: OUTRO,
      lastReadAt: null,
      ultimaMensagemEm: "2026-01-02T09:00:00Z",
      ultimaMensagemTexto: "oi",
      naoLidas: 1,
    },
];

describe("montarListaChat", () => {
  const canais = canaisBase;

  it("Geral no topo, com conversa antes de quem nunca falou, e ignora o próprio usuário", () => {

    const lista = montarListaChat(
      [
        { id: EU, nome: "Eu", avatarColor: null },
        { id: OUTRO, nome: "Bruno", avatarColor: null },
        { id: "33333333-3333-4333-8333-333333333333", nome: "Ana", avatarColor: null },
      ],
      canais,
      EU,
    );
    expect(lista.map((i) => i.titulo)).toEqual(["Geral", "Bruno", "Ana"]);
    expect(lista[2]!.canalId).toBeNull();
    expect(totalNaoLidas(lista)).toBe(3);
  });

  it("sem canal Geral (não é membro), o item Geral nem aparece", () => {
    const lista = montarListaChat(
      [
        { id: EU, nome: "Eu", avatarColor: null },
        { id: OUTRO, nome: "Bruno", avatarColor: null },
      ],
      canais.filter((c) => c.tipo !== "geral"),
      EU,
    );
    expect(lista.map((i) => i.titulo)).toEqual(["Bruno"]);
    expect(lista.some((i) => i.tipo === "geral")).toBe(false);
  });
});

describe("prepararTexto", () => {
  it("recusa vazio e acima do limite", () => {
    expect(prepararTexto("  ")).toBeNull();
    expect(prepararTexto("a".repeat(4001))).toBeNull();
    expect(prepararTexto("  oi ")).toBe("oi");
  });
});

describe("grupos nomeados", () => {
  it("Geral primeiro, depois grupos por nome, depois as DMs", () => {
    const lista = montarListaChat(
      [
        { id: EU, nome: "Eu", avatarColor: null },
        { id: OUTRO, nome: "Bruno", avatarColor: null },
      ],
      [
        {
          canalId: "g1",
          tipo: "grupo",
          nome: "Grupo Comercial",
          outroUserId: null,
          lastReadAt: null,
          ultimaMensagemEm: null,
          ultimaMensagemTexto: null,
          naoLidas: 3,
        },
        ...canaisBase,
      ],
      EU,
    );
    expect(lista.map((i) => i.titulo)).toEqual(["Geral", "Grupo Comercial", "Bruno"]);
    expect(totalNaoLidas(lista)).toBe(6);
  });

  it("quem não é membro do grupo não vê o item", () => {
    const lista = montarListaChat(
      [
        { id: EU, nome: "Eu", avatarColor: null },
        { id: OUTRO, nome: "Bruno", avatarColor: null },
      ],
      canaisBase.filter((c) => c.tipo === "direto"),
      EU,
    );
    expect(lista.map((i) => i.tipo)).toEqual(["direto"]);
  });
});

describe("anexos do chat", () => {
  it("recusa arquivo grande e tipo executável, aceita imagem e PDF", () => {
    expect(validarAnexoChat({ size: 16 * 1024 * 1024, type: "image/png" })).toMatch(/15 MB/);
    expect(validarAnexoChat({ size: 10, type: "application/x-msdownload" })).toMatch(/não aceito/);
    expect(validarAnexoChat({ size: 10, type: "image/png" })).toBeNull();
    expect(validarAnexoChat({ size: 10, type: "application/pdf" })).toBeNull();
    expect(validarAnexoChat({ size: 0, type: "image/png" })).toMatch(/vazio/);
  });

  it("monta caminho por canal com nome sanitizado", () => {
    expect(caminhoAnexoChat("c1", "Relatório final (1).pdf", "u1")).toBe(
      "c1/u1-Relato_rio_final_1_.pdf",
    );
  });

  it("reconhece imagem e formata tamanho", () => {
    expect(ehImagemAnexo("image/jpeg")).toBe(true);
    expect(ehImagemAnexo("application/pdf")).toBe(false);
    expect(formatarTamanhoAnexo(2048)).toBe("2 KB");
  });
});

describe("anexosChatExpirados", () => {
  const agora = new Date("2026-02-01T06:00:00Z");
  it("só pega mensagens com anexo e com mais de 15 dias", () => {
    const r = anexosChatExpirados(
      [
        { id: "a", criado_em: "2026-01-10T06:00:00Z", anexo_path: "c/1.png" }, // 22 dias
        { id: "b", criado_em: "2026-01-25T06:00:00Z", anexo_path: "c/2.png" }, // 7 dias
        { id: "c", criado_em: "2026-01-01T06:00:00Z", anexo_path: null }, // sem anexo
        { id: "d", criado_em: "nao-e-data", anexo_path: "c/3.png" },
      ],
      agora,
    );
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("na virada exata do 15º dia ainda não apaga", () => {
    const quinzeDias = new Date(agora.getTime() - 15 * 86400_000).toISOString();
    expect(
      anexosChatExpirados([{ id: "a", criado_em: quinzeDias, anexo_path: "c/1.png" }], agora),
    ).toHaveLength(0);
  });
});
