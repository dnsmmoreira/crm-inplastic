/**
 * Quem o Xerife pode cobrar.
 *
 * Lead ENCERRADO (ganho ou perdido) não tem mais próximo ato comercial: não
 * pode gerar SLA, cadência, follow-up nem escalação. A única família de regras
 * que roda depois do ganho é o PÓS-VENDA, que consulta `stage = 'ganho'`
 * explicitamente e por isso não usa este filtro.
 *
 * Motivo: leads perdidos (duplicados, por exemplo) seguiam gerando tarefa e
 * penalidade no placar todo dia, para sempre.
 */

export const STAGES_ENCERRADOS = ["ganho", "perdido"] as const;

/** Filtro pronto para o PostgREST: `.not("stage", "in", SQL_STAGES_ENCERRADOS)`. */
export const SQL_STAGES_ENCERRADOS = "(ganho,perdido)";

/** O lead ainda comporta cobrança comercial? */
export function leadCobravel(stage: string | null | undefined): boolean {
  if (!stage) return true; // sem etapa conhecida, não bloqueia
  return !(STAGES_ENCERRADOS as readonly string[]).includes(String(stage));
}

/** Só o pós-venda roda depois do ganho; perdido nunca roda. */
export function leadCobravelPosVenda(stage: string | null | undefined): boolean {
  return String(stage ?? "") !== "perdido";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/**
 * Ids (dos informados) cujo lead está ganho ou perdido. Em caso de erro devolve
 * conjunto vazio — o filtro nunca pode derrubar o motor.
 */
export async function leadsEncerrados(sb: SB, ids: Array<string | null | undefined>): Promise<Set<string>> {
  const lista = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!lista.length) return new Set();
  const { data } = await sb
    .from("leads")
    .select("id, stage")
    .in("id", lista)
    .in("stage", STAGES_ENCERRADOS as unknown as string[]);
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}
