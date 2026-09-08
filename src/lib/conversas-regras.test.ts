import { describe, it, expect } from "vitest";
import {
  conversaAbandonadaPelaIA,
  conversaHumanaParada,
  conversaIdDaDescricao,
  tagConversa,
  janelaA6,
  diasParada,
  A6_HORAS_IA,
  A6_HORAS_AGUARDANDO_HUMANO,
} from "@/lib/conversas-regras";

const win = { inicio: "08:00", fim: "18:00" };
// Quarta-feira, 16:00 SP (19:00 UTC).
const now = new Date("2026-09-09T19:00:00.000Z");

describe("A6 — conversa abandonada pela IA", () => {
  const base = { status: "ia_atendendo", ia_ativa: true, last_message_at: null as string | null };

  it("pega conversa com a IA parada há mais de 4h úteis", () => {
    const conv = { ...base, last_message_at: "2026-09-09T12:00:00.000Z" }; // 09:00 SP
    expect(conversaAbandonadaPelaIA(conv, now, win)).toBe(true);
  });

  it("ignora conversa que acabou de falar", () => {
    const conv = { ...base, last_message_at: "2026-09-09T18:30:00.000Z" };
    expect(conversaAbandonadaPelaIA(conv, now, win)).toBe(false);
  });

  it("ignora quando a IA está desligada ou o status não é da IA", () => {
    const antiga = "2026-09-09T12:00:00.000Z";
    expect(conversaAbandonadaPelaIA({ ...base, ia_ativa: false, last_message_at: antiga }, now, win)).toBe(false);
    expect(
      conversaAbandonadaPelaIA({ ...base, status: "humano_atendendo", last_message_at: antiga }, now, win),
    ).toBe(false);
  });

  it("aguardando_humano usa janela de 1h útil", () => {
    expect(janelaA6("aguardando_humano")).toBe(A6_HORAS_AGUARDANDO_HUMANO);
    expect(janelaA6("ia_atendendo")).toBe(A6_HORAS_IA);
    const conv = {
      status: "aguardando_humano",
      ia_ativa: true,
      last_message_at: "2026-09-09T16:00:00.000Z", // 13:00 SP → 3h úteis
    };
    expect(conversaAbandonadaPelaIA(conv, now, win)).toBe(true);
  });

  it("ignora conversa morta há mais de 30 dias", () => {
    const conv = { ...base, last_message_at: "2026-06-01T12:00:00.000Z" };
    expect(conversaAbandonadaPelaIA(conv, now, win)).toBe(false);
  });
});

describe("A7 — conversa humana parada", () => {
  const parada = {
    status: "humano_atendendo",
    atribuido_para: "u1",
    em_espera_desde: null as string | null,
    last_message_at: "2026-09-01T12:00:00.000Z",
  };

  it("pega conversa sem movimento há 3+ dias úteis", () => {
    expect(conversaHumanaParada(parada, null, now, win)).toBe(true);
    expect(diasParada(parada.last_message_at, now)).toBe(8);
  });

  it("ignora conversa em espera, sem dono ou recente", () => {
    expect(conversaHumanaParada({ ...parada, em_espera_desde: "2026-09-05T12:00:00Z" }, null, now, win)).toBe(false);
    expect(conversaHumanaParada({ ...parada, atribuido_para: null }, null, now, win)).toBe(false);
    expect(conversaHumanaParada({ ...parada, last_message_at: "2026-09-09T13:00:00Z" }, null, now, win)).toBe(false);
  });

  it("ignora lead encerrado ou com retorno combinado no futuro", () => {
    expect(conversaHumanaParada(parada, { stage: "ganho" }, now, win)).toBe(false);
    expect(conversaHumanaParada(parada, { stage: "perdido" }, now, win)).toBe(false);
    expect(
      conversaHumanaParada(parada, { stage: "proposta", next_followup: "2026-09-20T12:00:00Z" }, now, win),
    ).toBe(false);
    expect(
      conversaHumanaParada(parada, { stage: "proposta", next_followup: "2026-09-01T12:00:00Z" }, now, win),
    ).toBe(true);
  });
});

describe("tag da conversa", () => {
  it("ida e volta", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(conversaIdDaDescricao(`bla ${tagConversa(id)} bla`)).toBe(id);
    expect(conversaIdDaDescricao("sem tag")).toBeNull();
    expect(conversaIdDaDescricao(null)).toBeNull();
  });
});

// ─── Desfechos do tipo conversa_parada (Bloco 3)
import {
  desfechosParaTipo,
  desfechoPermitido,
  validarDesfecho,
  carenciaHorasUteis,
  exigeDesfecho,
} from "@/lib/tarefa-desfecho";

describe("desfechos de conversa parada", () => {
  it("oferece espera/encerrar e esconde perdido sem lead", () => {
    const tipos = desfechosParaTipo("conversa_parada", { temLead: false }).map((d) => d.tipo);
    expect(tipos).toContain("em_espera");
    expect(tipos).toContain("encerrar_conversa");
    expect(tipos).not.toContain("perdido");
  });

  it("permite perdido quando há lead", () => {
    expect(desfechoPermitido("conversa_parada", "perdido", { temLead: true })).toBe(true);
  });

  it("não oferece encerrar_conversa em tarefa de follow-up", () => {
    expect(desfechoPermitido("follow_up", "encerrar_conversa", { temLead: true })).toBe(false);
  });

  it("exige desfecho mesmo sem lead", () => {
    expect(exigeDesfecho({ origem: "xerife", tipo: "conversa_parada", lead_id: null })).toBe(true);
  });

  it("encerrar_conversa exige motivo e em_espera exige data", () => {
    const ctx = { tipoTarefa: "conversa_parada", temLead: false } as const;
    expect(validarDesfecho({ tipo: "encerrar_conversa", detalhe: "ok" }, ctx).ok).toBe(false);
    expect(
      validarDesfecho({ tipo: "encerrar_conversa", detalhe: "cliente comprou fora" }, ctx).ok,
    ).toBe(true);
    expect(validarDesfecho({ tipo: "em_espera", data: "" }, ctx).ok).toBe(false);
  });

  it("carência de 30 horas úteis", () => {
    expect(carenciaHorasUteis("conversa_parada")).toBe(30);
  });
});
