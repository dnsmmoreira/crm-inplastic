/**
 * Mensagem que chega fora do horário de atendimento.
 *
 * Lógica pura (sem banco): decide se o cliente merece uma resposta automática
 * — no máximo UMA por período fora do horário — e calcula a próxima abertura
 * útil, que vira o prazo da tarefa do vendedor na manhã seguinte.
 *
 * Fuso fixo America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
 */

export type JanelaUtil = { inicio: string; fim: string };

export type ConversaForaHorario = {
  status: string | null;
  ia_ativa: boolean | null;
  atribuido_para: string | null;
  auto_resposta_em: string | null;
};

const TZ = "America/Sao_Paulo";
const OFFSET_H = 3; // SP = UTC-3

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number; semana: number };

export function partesSp(d: Date): Partes {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const p = fmt.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    ano: Number(get("year")),
    mes: Number(get("month")),
    dia: Number(get("day")),
    hora: Number(get("hour")) % 24,
    minuto: Number(get("minute")),
    semana: wd[get("weekday")] ?? 0,
  };
}

function spParaUtc(ano: number, mes: number, dia: number, h: number, m: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, h + OFFSET_H, m, 0, 0));
}

export function parseHm(hm: string | null | undefined): { h: number; m: number } {
  const [h, m] = String(hm ?? "08:00").split(":");
  const hh = Number(h);
  const mm = Number(m);
  return { h: Number.isFinite(hh) ? hh : 8, m: Number.isFinite(mm) ? mm : 0 };
}

function ehDiaUtil(semana: number): boolean {
  return semana >= 1 && semana <= 5;
}

/** Está dentro da janela útil (seg–sex, [inicio, fim))? */
export function dentroDoHorario(now: Date, win: JanelaUtil): boolean {
  const p = partesSp(now);
  if (!ehDiaUtil(p.semana)) return false;
  const ini = parseHm(win.inicio);
  const fim = parseHm(win.fim);
  const min = p.hora * 60 + p.minuto;
  return min >= ini.h * 60 + ini.m && min < fim.h * 60 + fim.m;
}

/** Início da janela útil mais recente que já começou (hoje ou dia útil anterior). */
export function inicioJanelaVigente(now: Date, win: JanelaUtil): Date {
  const ini = parseHm(win.inicio);
  let p = partesSp(now);
  // hoje é dia útil e a janela já abriu → é hoje
  if (ehDiaUtil(p.semana) && p.hora * 60 + p.minuto >= ini.h * 60 + ini.m) {
    return spParaUtc(p.ano, p.mes, p.dia, ini.h, ini.m);
  }
  let cur = new Date(now.getTime());
  for (let i = 0; i < 10; i++) {
    cur = new Date(cur.getTime() - 86400_000);
    p = partesSp(cur);
    if (ehDiaUtil(p.semana)) return spParaUtc(p.ano, p.mes, p.dia, ini.h, ini.m);
  }
  return spParaUtc(p.ano, p.mes, p.dia, ini.h, ini.m);
}

/** Próxima abertura útil depois de `now` (hoje se ainda não abriu). */
export function proximaAberturaUtil(now: Date, win: JanelaUtil): Date {
  const ini = parseHm(win.inicio);
  const p0 = partesSp(now);
  if (ehDiaUtil(p0.semana) && p0.hora * 60 + p0.minuto < ini.h * 60 + ini.m) {
    return spParaUtc(p0.ano, p0.mes, p0.dia, ini.h, ini.m);
  }
  let cur = new Date(now.getTime());
  for (let i = 0; i < 10; i++) {
    cur = new Date(cur.getTime() + 86400_000);
    const p = partesSp(cur);
    if (ehDiaUtil(p.semana)) return spParaUtc(p.ano, p.mes, p.dia, ini.h, ini.m);
  }
  return new Date(now.getTime() + 86400_000);
}

/**
 * Responder automaticamente? Só quando: fora do horário, conversa com dono
 * humano, IA desligada, conversa aberta e ainda sem auto-resposta neste
 * período (a última é anterior à janela útil vigente).
 */
export function deveAutoResponder(
  conv: ConversaForaHorario | null | undefined,
  now: Date,
  win: JanelaUtil,
): boolean {
  if (!conv) return false;
  if (dentroDoHorario(now, win)) return false;
  if (!conv.atribuido_para) return false;
  if (conv.ia_ativa) return false;
  if (conv.status === "encerrado") return false;
  if (!conv.auto_resposta_em) return true;
  const ultima = new Date(conv.auto_resposta_em);
  if (isNaN(ultima.getTime())) return true;
  return ultima.getTime() < inicioJanelaVigente(now, win).getTime();
}

function primeiroNome(nome: string | null | undefined): string | null {
  const n = String(nome ?? "").trim();
  if (!n) return null;
  return n.split(/\s+/)[0] ?? null;
}

/** Texto neutro, curto e sem nome de empresa. */
export function textoAutoResposta(atendente: string | null | undefined, win: JanelaUtil): string {
  const ini = parseHm(win.inicio);
  const hora = `${ini.h}h${ini.m ? String(ini.m).padStart(2, "0") : ""}`;
  const quem = primeiroNome(atendente);
  const retorno = quem ? `${quem} retorna` : "Nossa equipe retorna";
  return `Olá! Recebemos sua mensagem fora do nosso horário de atendimento. ${retorno} a partir das ${hora} no próximo dia útil.`;
}

/** "Cliente escreveu fora do horário (12/09 21h40): ACME" */
export function tituloTarefaForaHorario(
  quando: Date,
  cliente: string | null | undefined,
): string {
  const p = partesSp(quando);
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");
  const hh = String(p.hora).padStart(2, "0");
  const mi = String(p.minuto).padStart(2, "0");
  const nome = String(cliente ?? "").trim() || "cliente";
  return `Cliente escreveu fora do horário (${dd}/${mm} ${hh}h${mi}): ${nome}`.slice(0, 200);
}
