/**
 * Quanto tempo uma tarefa está vencida — módulo puro.
 *
 * O fechamento do dia rola o `due_date` de TODA tarefa aberta para o dia
 * seguinte, então "vencida" nunca pode ser medida só pela data: ela nunca fica
 * no passado. A fonte confiável é `tarefas.escalonamentos` (+1 a cada rolagem).
 *
 * Regra: dias vencida = max(rolagens, dias corridos desde o due_date).
 */

const DIA_MS = 86_400_000;

export type TarefaVencimento = {
  escalonamentos?: number | null;
  due_date?: string | null;
  status?: string | null;
};

/** Dias corridos (inteiros) desde `due_date`; 0 quando no futuro ou sem data. */
export function diasCorridosDesde(
  due: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!due) return 0;
  const t = new Date(due).getTime();
  if (!Number.isFinite(t)) return 0;
  const dias = Math.floor((now.getTime() - t) / DIA_MS);
  return dias > 0 ? dias : 0;
}

/** Quantos dias a tarefa está vencida, contando rolagens do fechamento. */
export function diasVencida(t: TarefaVencimento, now: Date = new Date()): number {
  const rolagens = Number(t.escalonamentos ?? 0);
  const porRolagem = Number.isFinite(rolagens) && rolagens > 0 ? Math.floor(rolagens) : 0;
  return Math.max(porRolagem, diasCorridosDesde(t.due_date, now));
}

/** Está vencida há pelo menos `dias`? (`dias` mínimo 1) */
export function vencidaHa(t: TarefaVencimento, dias: number, now: Date = new Date()): boolean {
  return diasVencida(t, now) >= Math.max(1, dias);
}

export type FaixaVencimento = "0" | "1" | "2-4" | "5+";

export function faixaVencimento(t: TarefaVencimento, now: Date = new Date()): FaixaVencimento {
  const d = diasVencida(t, now);
  if (d <= 0) return "0";
  if (d === 1) return "1";
  if (d <= 4) return "2-4";
  return "5+";
}

/** "rolou 3×" para o badge da agenda; "" quando nunca rolou. */
export function rotuloRolagens(escalonamentos: number | null | undefined): string {
  const n = Number(escalonamentos ?? 0);
  return Number.isFinite(n) && n > 0 ? `rolou ${Math.floor(n)}×` : "";
}
