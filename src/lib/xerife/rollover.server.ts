/**
 * Xerife — regra D3 (rollover diário) — helpers puros e testáveis.
 *
 * Janela do dia calculada em America/Sao_Paulo (UTC-3 fixo, sem DST desde 2019).
 * Rollover pula sábado/domingo → próximo dia útil às 09:00 BRT.
 * Aplica-se a qualquer owner (admin ou vendedor).
 */

export const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

/** Instante "agora" no fuso de SP (representado como Date UTC deslocada). */
export function spNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + SP_OFFSET_MS);
}

/** ISO do fim do dia SP (23:59:59.999 SP) convertido para UTC. */
export function endOfTodaySpIso(now: Date = new Date()): string {
  const sp = spNow(now);
  const endSp = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 23, 59, 59, 999);
  return new Date(endSp - SP_OFFSET_MS).toISOString();
}

/** ISO do início do dia SP (00:00:00 SP) convertido para UTC. */
export function startOfTodaySpIso(now: Date = new Date()): string {
  const sp = spNow(now);
  const startSp = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 0, 0, 0, 0);
  return new Date(startSp - SP_OFFSET_MS).toISOString();
}

/** ISO do próximo dia útil às 09:00 SP (pula sáb/dom). */
export function nextBusinessDay9amIso(now: Date = new Date()): string {
  const sp = spNow(now);
  let y = sp.getUTCFullYear(), m = sp.getUTCMonth(), d = sp.getUTCDate() + 1;
  for (let i = 0; i < 7; i++) {
    const probe = new Date(Date.UTC(y, m, d, 12, 0, 0));
    const dow = probe.getUTCDay(); // 0 dom, 6 sáb
    if (dow !== 0 && dow !== 6) break;
    d += 1;
  }
  const target = Date.UTC(y, m, d, 9, 0, 0, 0);
  return new Date(target - SP_OFFSET_MS).toISOString();
}

export type RolloverInput = {
  prioridade: number | null | undefined;
  escalonamentos: number | null | undefined;
};

export type RolloverPatch = {
  due_date: string;
  escalonamentos: number;
  prioridade: number;
  status: "pendente";
};

/**
 * Calcula patch para uma tarefa rolada pelo fechamento diário.
 * Regra D3: escalonamentos+1, prioridade elevada (menor número = mais alta),
 *           mínimo 1, due_date = próximo dia útil 09:00 SP.
 */
export function computeRollover(task: RolloverInput, now: Date = new Date()): RolloverPatch {
  const prio = task.prioridade ?? 3;
  const esc = task.escalonamentos ?? 0;
  return {
    due_date: nextBusinessDay9amIso(now),
    escalonamentos: esc + 1,
    prioridade: Math.max(1, prio - 1),
    status: "pendente",
  };
}
