import { describe, expect, it } from "vitest";
import {
  dentroDoHorario,
  deveAutoResponder,
  inicioJanelaVigente,
  proximaAberturaUtil,
  textoAutoResposta,
  tituloTarefaForaHorario,
  type ConversaForaHorario,
} from "./fora-horario";

const win = { inicio: "08:00", fim: "18:00" };

// SP = UTC-3
const sp = (iso: string) => new Date(iso); // usar sempre horários UTC explícitos

const QUINTA_14H_SP = sp("2026-09-10T17:00:00Z"); // 14h SP
const QUINTA_21H_SP = sp("2026-09-11T00:00:00Z"); // 21h SP de quinta
const SEXTA_20H_SP = sp("2026-09-12T23:00:00Z"); // 20h SP sexta
const SABADO_10H_SP = sp("2026-09-12T13:00:00Z"); // sábado? -> ver abaixo

const base: ConversaForaHorario = {
  status: "humano_atendendo",
  ia_ativa: false,
  atribuido_para: "u1",
  auto_resposta_em: null,
};

describe("janela útil", () => {
  it("reconhece dentro e fora do horário", () => {
    expect(dentroDoHorario(QUINTA_14H_SP, win)).toBe(true);
    expect(dentroDoHorario(QUINTA_21H_SP, win)).toBe(false);
  });

  it("fim de semana está sempre fora", () => {
    const sabado = sp("2026-09-12T13:00:00Z"); // 12/09/2026 é sábado
    expect(dentroDoHorario(sabado, win)).toBe(false);
  });

  it("próxima abertura útil pula o fim de semana", () => {
    const sabado = sp("2026-09-12T13:00:00Z");
    const abre = proximaAberturaUtil(sabado, win);
    // segunda 14/09 às 08:00 SP = 11:00 UTC
    expect(abre.toISOString()).toBe("2026-09-14T11:00:00.000Z");
  });

  it("de madrugada, a abertura é no mesmo dia", () => {
    const madrugadaSegunda = sp("2026-09-14T06:00:00Z"); // 03h SP segunda
    expect(proximaAberturaUtil(madrugadaSegunda, win).toISOString()).toBe(
      "2026-09-14T11:00:00.000Z",
    );
  });

  it("janela vigente é a abertura mais recente já ocorrida", () => {
    expect(inicioJanelaVigente(QUINTA_21H_SP, win).toISOString()).toBe("2026-09-10T11:00:00.000Z");
  });
});

describe("deveAutoResponder", () => {
  it("responde uma vez fora do horário", () => {
    expect(deveAutoResponder(base, QUINTA_21H_SP, win)).toBe(true);
  });

  it("não responde dentro do horário", () => {
    expect(deveAutoResponder(base, QUINTA_14H_SP, win)).toBe(false);
  });

  it("não responde se a IA está ativa", () => {
    expect(deveAutoResponder({ ...base, ia_ativa: true }, QUINTA_21H_SP, win)).toBe(false);
  });

  it("não responde sem dono humano", () => {
    expect(deveAutoResponder({ ...base, atribuido_para: null }, QUINTA_21H_SP, win)).toBe(false);
  });

  it("não responde em conversa encerrada", () => {
    expect(deveAutoResponder({ ...base, status: "encerrado" }, QUINTA_21H_SP, win)).toBe(false);
  });

  it("não repete no mesmo período fora do horário", () => {
    const conv = { ...base, auto_resposta_em: "2026-09-10T23:00:00Z" }; // 20h SP quinta
    expect(deveAutoResponder(conv, QUINTA_21H_SP, win)).toBe(false);
  });

  it("responde de novo na noite seguinte", () => {
    const conv = { ...base, auto_resposta_em: "2026-09-10T23:00:00Z" };
    expect(deveAutoResponder(conv, SEXTA_20H_SP, win)).toBe(true);
  });

  it("conversa nula não gera resposta", () => {
    expect(deveAutoResponder(null, QUINTA_21H_SP, win)).toBe(false);
    expect(SABADO_10H_SP instanceof Date).toBe(true);
  });
});

describe("textos", () => {
  it("usa o primeiro nome do atendente e a hora de abertura", () => {
    expect(textoAutoResposta("Bruna Silva", win)).toContain("Bruna retorna a partir das 8h");
  });

  it("sem atendente, fala pela equipe", () => {
    expect(textoAutoResposta(null, win)).toContain("Nossa equipe retorna");
  });

  it("nunca cita empresa no texto", () => {
    expect(textoAutoResposta("Bruna", win).toLowerCase()).not.toContain("inplastic");
  });

  it("título da tarefa traz data, hora e cliente", () => {
    expect(tituloTarefaForaHorario(QUINTA_21H_SP, "ACME LTDA")).toBe(
      "Cliente escreveu fora do horário (10/09 21h00): ACME LTDA",
    );
  });
});
