/**
 * Regra pura do escalonamento financeiro do Xerife.
 *
 * Contexto: hoje só quem tem `pedidos.aprovar_financeiro` é avisado de pedido
 * em `analise_financeira`. Se essa pessoa falta, o pedido para e ninguém sabe.
 * Depois de 24h sem decisão, o Xerife escala para quem tem `usuarios.gerenciar`.
 *
 * Fonte da "entrada na etapa" (documentando a escolha):
 *   1º `pedido_stage_history` (último `to_stage = 'analise_financeira'`) — é o
 *      registro canônico da transição e não é afetado por edições no pedido;
 *   2º `aprovacao_solicitada_em` — usado quando não há histórico (pedidos
 *      antigos / criados antes do tracking);
 *   3º `updated_at` — último recurso.
 *
 * Pura de propósito: dá para testar sem banco.
 */

export const ESCALONAMENTO_FINANCEIRO_HORAS = 24;
/** Repete o escalonamento no máximo 1x por dia enquanto seguir sem decisão. */
export const ESCALONAMENTO_FINANCEIRO_REPETE_HORAS = 24;

export type PedidoParaEscalonar = {
  stage: string;
  /** `null` = ainda sem decisão financeira. */
  aprovacao_decisao: string | null;
  /** Quando o pedido entrou em `analise_financeira` (ISO). */
  entrou_na_etapa_em: string | null;
  /** Último escalonamento já enviado para este pedido (ISO) ou `null`. */
  ultimo_escalonamento_em?: string | null;
};

export type DecisaoEscalonamento = {
  escalar: boolean;
  horasParado: number;
  motivo:
    | "escalar"
    | "etapa_diferente"
    | "ja_decidido"
    | "sem_data"
    | "dentro_do_sla"
    | "escalado_recentemente";
};

function horasEntre(iso: string | null | undefined, agora: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (agora - t) / 3_600_000);
}

export function deveEscalarFinanceiro(
  p: PedidoParaEscalonar,
  agora: Date = new Date(),
): DecisaoEscalonamento {
  const now = agora.getTime();
  const horas = horasEntre(p.entrou_na_etapa_em, now);

  if (p.stage !== "analise_financeira") {
    return { escalar: false, horasParado: Math.floor(horas ?? 0), motivo: "etapa_diferente" };
  }
  if (p.aprovacao_decisao != null && String(p.aprovacao_decisao).trim() !== "") {
    return { escalar: false, horasParado: Math.floor(horas ?? 0), motivo: "ja_decidido" };
  }
  if (horas == null) {
    return { escalar: false, horasParado: 0, motivo: "sem_data" };
  }
  if (horas < ESCALONAMENTO_FINANCEIRO_HORAS) {
    return { escalar: false, horasParado: Math.floor(horas), motivo: "dentro_do_sla" };
  }

  const desdeUltimo = horasEntre(p.ultimo_escalonamento_em, now);
  if (desdeUltimo != null && desdeUltimo < ESCALONAMENTO_FINANCEIRO_REPETE_HORAS) {
    return { escalar: false, horasParado: Math.floor(horas), motivo: "escalado_recentemente" };
  }

  return { escalar: true, horasParado: Math.floor(horas), motivo: "escalar" };
}
