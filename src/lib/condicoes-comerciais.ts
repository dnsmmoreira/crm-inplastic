import { supabase } from "@/integrations/supabase/client";

/**
 * Condição comercial = nome + lista de prazos (em dias) usada para gerar
 * as parcelas da proposta a partir da previsão de faturamento.
 * À vista é representado pelo dia 0.
 */
export type CondicaoComercial = {
  id: string;
  nome: string;
  dias: number[];
  ativo: boolean;
  created_at: string;
};

export const CONDICOES_COMERCIAIS_KEY = ["condicoes_comerciais"] as const;

export async function listarCondicoesComerciais(): Promise<CondicaoComercial[]> {
  const { data, error } = await supabase
    .from("condicoes_comerciais")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    nome: r.nome,
    dias: (r.dias ?? []) as number[],
    ativo: !!r.ativo,
    created_at: r.created_at,
  }));
}

/** Converte "0/21/28" ou "21, 28" em uma lista de dias válida e crescente. */
export function parseDias(raw: string): { dias: number[]; erro?: string } {
  const parts = (raw ?? "")
    .split(/[,/;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { dias: [], erro: "Informe ao menos 1 prazo (0 = à vista)." };
  const dias: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { dias: [], erro: `Prazo inválido: "${p}". Use apenas números.` };
    dias.push(Number(p));
  }
  for (let i = 1; i < dias.length; i++) {
    if (dias[i] <= dias[i - 1]) return { dias: [], erro: "Os prazos devem estar em ordem crescente e sem repetição." };
  }
  return { dias };
}

export function formatDias(dias: number[]): string {
  return dias.map((d) => (d === 0 ? "à vista" : `${d}`)).join(" / ");
}

/** Soma dias a uma data yyyy-MM-dd sem sofrer shift de fuso. */
export function addDaysToDateInput(dateInput: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!m) return dateInput;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateBr(dateInput?: string | null): string {
  if (!dateInput) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateInput);
  if (!m) return dateInput;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Divide o total igualmente entre N parcelas, jogando o ajuste de centavos na última. */
export function dividirValor(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round((total || 0) * 100);
  const base = Math.floor(cents / n);
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = cents - base * (n - 1);
  return out.map((c) => +(c / 100).toFixed(2));
}
