import { describe, it, expect } from "vitest";
import {
  estaEmEspera,
  horasSemResposta,
  rotuloTempo,
  podeTransferirConversa,
  podeGerenciarEspera,
  esperaLonga,
  deveCobrarEspera,
  textoBolhaEspera,
} from "./atendimento-espera";

const agora = new Date("2026-03-10T18:00:00.000Z");
const hAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

describe("estaEmEspera", () => {
  it("reconhece espera e ausência dela", () => {
    expect(estaEmEspera({ em_espera_desde: hAtras(1) })).toBe(true);
    expect(estaEmEspera({ em_espera_desde: null })).toBe(false);
    expect(estaEmEspera(null)).toBe(false);
  });
});

describe("horasSemResposta", () => {
  it("conta desde a última mensagem do cliente", () => {
    const h = horasSemResposta({ ultima_msg_cliente_at: hAtras(3) }, agora);
    expect(h).toBeCloseTo(3, 5);
  });

  it("zera quando o vendedor já respondeu depois", () => {
    expect(
      horasSemResposta(
        { ultima_msg_cliente_at: hAtras(3), ultima_msg_vendedor_at: hAtras(1) },
        agora,
      ),
    ).toBeNull();
  });

  it("ignora conversas em espera", () => {
    expect(
      horasSemResposta({ ultima_msg_cliente_at: hAtras(30), em_espera_desde: hAtras(20) }, agora),
    ).toBeNull();
  });

  it("é null sem mensagem do cliente", () => {
    expect(horasSemResposta({ ultima_msg_cliente_at: null }, agora)).toBeNull();
  });
});

describe("rotuloTempo", () => {
  it("formata minutos, horas e dias", () => {
    expect(rotuloTempo(null)).toBe("—");
    expect(rotuloTempo(0.5)).toBe("30m");
    expect(rotuloTempo(2)).toBe("2h");
    expect(rotuloTempo(2.5)).toBe("2h 30m");
    expect(rotuloTempo(72)).toBe("3d");
  });
});

describe("permissões", () => {
  it("transferência: admin, dono ou atendente em conversa sem dono", () => {
    expect(
      podeTransferirConversa({ isAdmin: true, userId: "u1", podeAtender: false, donoAtual: "u2" }),
    ).toBe(true);
    expect(
      podeTransferirConversa({ isAdmin: false, userId: "u1", podeAtender: false, donoAtual: "u1" }),
    ).toBe(true);
    expect(
      podeTransferirConversa({ isAdmin: false, userId: "u1", podeAtender: true, donoAtual: null }),
    ).toBe(true);
    expect(
      podeTransferirConversa({ isAdmin: false, userId: "u1", podeAtender: true, donoAtual: "u2" }),
    ).toBe(false);
  });

  it("espera: admin ou dono", () => {
    expect(podeGerenciarEspera({ isAdmin: false, userId: "u1", donoAtual: "u1" })).toBe(true);
    expect(podeGerenciarEspera({ isAdmin: false, userId: "u1", donoAtual: "u2" })).toBe(false);
    expect(podeGerenciarEspera({ isAdmin: false, userId: "u1", donoAtual: null })).toBe(false);
    expect(podeGerenciarEspera({ isAdmin: true, userId: "u1", donoAtual: null })).toBe(true);
  });
});

describe("espera longa", () => {
  it("dispara só depois de 4h", () => {
    expect(esperaLonga({ em_espera_desde: hAtras(3) }, agora)).toBe(false);
    expect(esperaLonga({ em_espera_desde: hAtras(5) }, agora)).toBe(true);
  });

  it("não repete o aviso antes de 24h", () => {
    expect(
      deveCobrarEspera({ em_espera_desde: hAtras(5), ultimoAvisoEm: null }, agora),
    ).toBe(true);
    expect(
      deveCobrarEspera({ em_espera_desde: hAtras(30), ultimoAvisoEm: hAtras(2) }, agora),
    ).toBe(false);
    expect(
      deveCobrarEspera({ em_espera_desde: hAtras(50), ultimoAvisoEm: hAtras(25) }, agora),
    ).toBe(true);
  });
});

describe("textoBolhaEspera", () => {
  it("inclui quem colocou quando conhecido", () => {
    const t = textoBolhaEspera({ em_espera_desde: hAtras(1), nomeQuemColocou: "Denis" });
    expect(t).toContain("Atendimento em espera desde");
    expect(t).toContain("(colocado por Denis)");
  });

  it("omite o autor quando desconhecido", () => {
    expect(textoBolhaEspera({ em_espera_desde: hAtras(1) })).not.toContain("colocado por");
  });
});
