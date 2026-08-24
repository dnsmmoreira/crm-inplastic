import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

/**
 * Leituras auxiliares dos dashboards por papel (Financeiro / Operacional).
 * Tudo passa pelo client do usuário — a visibilidade é a MESMA que a RLS já
 * concede (pedidos.ver_todos / pedidos.movimentar para o histórico; tarefas são
 * sempre do próprio dono). Nenhum client de serviço, nenhuma mudança de RLS.
 */

export type DecisoesSemana = {
  desde: string;
  aprovados: number;
  reprovados: number;
};

/**
 * Contagem de decisões financeiras dos últimos 7 dias, lida de
 * `pedido_stage_history`:
 *  - aprovados  = transições saindo de `analise_financeira` para
 *                 `programacao` ou `aguardando_pagamento`;
 *  - reprovados = transições cujo destino é `reprovado_financeiro`.
 */
export const decisoesFinanceirasSemana = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DecisoesSemana> => {
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("pedido_stage_history")
      .select("from_stage, to_stage")
      .gte("created_at", desde)
      .limit(2000);
    if (error) throw new Error(`Falha ao ler histórico de etapas: ${error.message}`);

    let aprovados = 0;
    let reprovados = 0;
    for (const h of (data ?? []) as Array<{ from_stage: string | null; to_stage: string | null }>) {
      if (h.to_stage === "reprovado_financeiro") reprovados++;
      else if (
        h.from_stage === "analise_financeira" &&
        (h.to_stage === "programacao" || h.to_stage === "aguardando_pagamento")
      )
        aprovados++;
    }
    return { desde, aprovados, reprovados };
  });

export type TarefaProducaoRow = {
  pedido_id: string;
  due_date: string | null;
};

/**
 * Tarefas `acompanhar_producao` em aberto do usuário logado (RLS: owner_id),
 * usadas só para mostrar o prazo ao lado do pedido em produção.
 */
export const tarefasProducaoAbertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TarefaProducaoRow[]> => {
    const { data, error } = await context.supabase
      .from("tarefas")
      .select("pedido_id, due_date")
      .eq("tipo", "acompanhar_producao")
      .in("status", ["pendente", "adiada"])
      .limit(500);
    if (error) throw new Error(`Falha ao ler tarefas de produção: ${error.message}`);
    return ((data ?? []) as Array<{ pedido_id: string | null; due_date: string | null }>)
      .filter((t): t is TarefaProducaoRow => !!t.pedido_id)
      .map((t) => ({ pedido_id: t.pedido_id, due_date: t.due_date ?? null }));
  });
