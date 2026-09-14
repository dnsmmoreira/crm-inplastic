import { describe, expect, it } from "vitest";
import {
  montarListaChat,
  outroDoParChave,
  prepararTexto,
  primeiroNome,
  resumirPorCanal,
  totalNaoLidas,
  type ChatCanalResumo,
} from "./chat-interno";

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

describe("montarListaChat", () => {
  const canais: ChatCanalResumo[] = [
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
});

describe("prepararTexto", () => {
  it("recusa vazio e acima do limite", () => {
    expect(prepararTexto("  ")).toBeNull();
    expect(prepararTexto("a".repeat(4001))).toBeNull();
    expect(prepararTexto("  oi ")).toBe("oi");
  });
});
