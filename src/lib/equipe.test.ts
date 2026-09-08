import { describe, expect, it } from "vitest";
import { agregarEquipe, type EntradaEquipe } from "./equipe.server";

const now = new Date("2026-09-10T12:00:00Z");
const diasAtras = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

function entrada(over: Partial<EntradaEquipe> = {}): EntradaEquipe {
  return {
    pessoas: [
      { id: "a", nome: "Ana", gestor_id: "k", telegram: true },
      { id: "b", nome: "Bruno", gestor_id: null, telegram: false },
    ],
    tarefas: [],
    leads: [],
    propostas: [],
    pedidos: [],
    aceites: [],
    now,
    ...over,
  };
}

describe("agregarEquipe", () => {
  it("conta tarefas abertas, vencidas e por tipo", () => {
    const r = agregarEquipe(
      entrada({
        tarefas: [
          { owner_id: "a", tipo: "primeiro_contato", status: "pendente", due_date: diasAtras(3), concluida_at: null },
          { owner_id: "a", tipo: "destravar", status: "pendente", due_date: diasAtras(2), concluida_at: null },
          { owner_id: "a", tipo: "destravar", status: "pendente", due_date: null, concluida_at: null },
          { owner_id: "b", tipo: "resposta_pendente", status: "adiada", due_date: diasAtras(0.2), concluida_at: null },
        ],
      }),
    );
    const ana = r.linhas.find((l) => l.id === "a")!;
    expect(ana.tarefasAbertas).toBe(3);
    expect(ana.tarefasVencidas).toBe(2);
    expect(ana.tarefasPorTipo["destravar"]).toBe(2);
    const bruno = r.linhas.find((l) => l.id === "b")!;
    // vencida há menos de 1 dia não conta como vencida
    expect(bruno.tarefasVencidas).toBe(0);
    expect(bruno.semResposta).toBe(1);
  });

  it("guarda a última conclusão e ignora concluídas na contagem", () => {
    const r = agregarEquipe(
      entrada({
        tarefas: [
          { owner_id: "a", tipo: "destravar", status: "concluida", due_date: null, concluida_at: diasAtras(4) },
          { owner_id: "a", tipo: "destravar", status: "concluida", due_date: null, concluida_at: diasAtras(1) },
        ],
      }),
    );
    const ana = r.linhas.find((l) => l.id === "a")!;
    expect(ana.tarefasAbertas).toBe(0);
    expect(ana.ultimaConclusao).toBe(diasAtras(1));
  });

  it("conta leads sem contato há 5+ dias", () => {
    const r = agregarEquipe(
      entrada({
        leads: [
          { id: "l1", company: "ACME", owner_id: "a", stage: "novo", last_interaction_at: diasAtras(6), created_at: diasAtras(20) },
          { id: "l2", company: "Beta", owner_id: "a", stage: "novo", last_interaction_at: diasAtras(1), created_at: diasAtras(20) },
        ],
      }),
    );
    const ana = r.linhas.find((l) => l.id === "a")!;
    expect(ana.leadsSemContato).toBe(1);
    expect(ana.itens.some((i) => i.link === "/leads?lead=l1")).toBe(true);
  });

  it("soma propostas, pedidos e ordena pelo total", () => {
    const r = agregarEquipe(
      entrada({
        propostas: [
          { id: "p1", number: "2026-1", owner_id: "b", status: "enviada", vencida: true, rascunhoParado: false },
          { id: "p2", number: "2026-2", owner_id: "b", status: "rascunho", vencida: false, rascunhoParado: true },
        ],
        pedidos: [
          { id: "pd1", number: "9", owner_id: "b", semResponsavel: true, posVendaAtrasado: false },
        ],
        aceites: [{ user_id: "b" }, { user_id: "b" }],
      }),
    );
    expect(r.linhas[0]!.id).toBe("b");
    const bruno = r.linhas[0]!;
    expect(bruno.total).toBe(3); // aceites não entram no total
    expect(bruno.aceitesPendentes).toBe(2);
    expect(r.totais.semProximoAto).toBe(3);
    expect(r.totais.propostasVencidas).toBe(1);
    expect(r.totais.pedidosSemResponsavel).toBe(1);
  });

  it("conversas paradas e retornos vencidos entram nos totais", () => {
    const r = agregarEquipe(
      entrada({
        tarefas: [
          { owner_id: "a", tipo: "conversa_parada", status: "pendente", due_date: diasAtras(3), concluida_at: null },
          { owner_id: "a", tipo: "retorno_agendado", status: "pendente", due_date: diasAtras(2), concluida_at: null },
        ],
      }),
    );
    expect(r.totais.conversasParadas).toBe(1);
    expect(r.totais.retornosVencidos).toBe(1);
    expect(r.totais.tarefasVencidas).toBe(2);
  });

  it("marca quem está sem Telegram", () => {
    const r = agregarEquipe(entrada());
    expect(r.linhas.find((l) => l.id === "b")!.telegram).toBe(false);
  });
});
