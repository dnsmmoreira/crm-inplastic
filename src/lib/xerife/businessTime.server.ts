/**
 * Horas úteis America/Sao_Paulo.
 * Seg-Sex, janela [inicio, fim) definida em xerife_config (default 08:00-18:00).
 *
 * CRÍTICO: 15 min úteis ≠ 15 min corridos.
 * Lead criado sex 17:50 com SLA de 15min só estoura na seg às 08:05.
 */

const TZ = "America/Sao_Paulo";

/** Retorna {year,month,day,hour,minute,weekday(0=dom..6=sab)} do instante em SP. */
export function toSpParts(d: Date): {
  year: number; month: number; day: number; hour: number; minute: number; weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: wdMap[get("weekday")] ?? 0,
  };
}

/** UTC Date para o instante local SP dado (year,month,day,hour,minute).
 *  SP é UTC-3 sem DST desde 2019 → offset fixo. */
function spLocalToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi, 0, 0));
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((x) => Number(x));
  return { h: h ?? 8, m: m ?? 0 };
}

export type BusinessWindow = { inicio: string; fim: string };

/** É dia útil (Seg-Sex) em SP? */
export function isBusinessDaySp(d: Date): boolean {
  const w = toSpParts(d).weekday;
  return w >= 1 && w <= 5;
}

/** Está dentro do horário útil agora? */
export function isBusinessNow(win: BusinessWindow, now = new Date()): boolean {
  const p = toSpParts(now);
  if (p.weekday < 1 || p.weekday > 5) return false;
  const ini = parseHm(win.inicio);
  const fim = parseHm(win.fim);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= ini.h * 60 + ini.m && minutes < fim.h * 60 + fim.m;
}

/** Minutos úteis entre 'from' (mais antigo) e 'to' (mais recente). Nunca negativo. */
export function businessMinutesBetween(from: Date, to: Date, win: BusinessWindow): number {
  if (to <= from) return 0;
  const ini = parseHm(win.inicio);
  const fim = parseHm(win.fim);
  const dayMinutes = (fim.h * 60 + fim.m) - (ini.h * 60 + ini.m);
  if (dayMinutes <= 0) return 0;

  let total = 0;
  // Cursor: início do próximo bloco a considerar (em UTC), mas raciocinando em datas SP.
  let cur = new Date(from.getTime());
  // Cap defensivo: 200 dias corridos.
  for (let guard = 0; guard < 200; guard++) {
    if (cur >= to) break;
    const p = toSpParts(cur);
    const isWeekday = p.weekday >= 1 && p.weekday <= 5;
    const dayStart = spLocalToUtc(p.year, p.month, p.day, ini.h, ini.m);
    const dayEnd = spLocalToUtc(p.year, p.month, p.day, fim.h, fim.m);

    if (isWeekday) {
      const segStart = cur < dayStart ? dayStart : cur;
      const segEnd = to < dayEnd ? to : dayEnd;
      if (segEnd > segStart) {
        total += (segEnd.getTime() - segStart.getTime()) / 60000;
      }
    }
    // Avança para 00:00 SP do dia seguinte
    const nextLocal = spLocalToUtc(p.year, p.month, p.day + 1, 0, 0);
    cur = nextLocal;
  }
  return Math.floor(total);
}

/** Retorna a Date correspondente a "now - N minutos úteis". */
export function subtractBusinessMinutes(mins: number, win: BusinessWindow, now = new Date()): Date {
  if (mins <= 0) return now;
  const ini = parseHm(win.inicio);
  const fim = parseHm(win.fim);
  const dayMinutes = (fim.h * 60 + fim.m) - (ini.h * 60 + ini.m);
  if (dayMinutes <= 0) return now;

  let remaining = mins;
  let cur = new Date(now.getTime());
  for (let guard = 0; guard < 400; guard++) {
    if (remaining <= 0) break;
    const p = toSpParts(cur);
    const isWeekday = p.weekday >= 1 && p.weekday <= 5;
    const dayStart = spLocalToUtc(p.year, p.month, p.day, ini.h, ini.m);
    const dayEnd = spLocalToUtc(p.year, p.month, p.day, fim.h, fim.m);

    if (isWeekday) {
      const segEnd = cur < dayEnd ? cur : dayEnd;
      if (segEnd > dayStart) {
        const available = (segEnd.getTime() - dayStart.getTime()) / 60000;
        if (available >= remaining) {
          return new Date(segEnd.getTime() - remaining * 60000);
        }
        remaining -= available;
      }
    }
    // volta para 23:59:59 do dia anterior (SP)
    cur = new Date(spLocalToUtc(p.year, p.month, p.day, 0, 0).getTime() - 1000);
  }
  return cur;
}

export function subtractBusinessHours(hours: number, win: BusinessWindow, now = new Date()): Date {
  return subtractBusinessMinutes(Math.round(hours * 60), win, now);
}

/** Dias úteis: subtrai N dias que caem em Seg-Sex, ignora horário. */
export function subtractBusinessDays(days: number, now = new Date()): Date {
  if (days <= 0) return now;
  let cur = new Date(now.getTime());
  let left = days;
  for (let guard = 0; guard < 400 && left > 0; guard++) {
    cur = new Date(cur.getTime() - 86400000);
    if (isBusinessDaySp(cur)) left--;
  }
  return cur;
}

/** ISO helper */
export const iso = (d: Date) => d.toISOString();
