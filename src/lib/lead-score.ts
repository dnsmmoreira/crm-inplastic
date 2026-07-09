// Score de Cadastro (0-100) — heurística local, gratuita, derivada dos dados
// públicos da Receita (CNPJá). NÃO é score de crédito: é indicador de
// qualidade cadastral / risco básico para priorização comercial.

import type { Lead } from "@/lib/crm-store";

export type ScoreLevel = "alto" | "medio" | "baixo";

export type LeadScore = {
  score: number;              // 0..100
  level: ScoreLevel;          // alto (verde) / medio (âmbar) / baixo (vermelho)
  label: string;              // "Baixo risco", etc
  emoji: string;
  className: string;          // classes tailwind para o badge
  reasons: { ok: boolean; text: string }[];
  faturamentoEstimado?: number; // teto da faixa do porte, quando conhecido
};

/** Teto anual da faixa de faturamento por porte declarado na Receita. */
export function faturamentoTetoPorPorte(porte?: string): number | undefined {
  const p = (porte ?? "").toUpperCase();
  if (p.includes("MEI")) return 81_000;
  if (p.includes("ME") || p.includes("MICRO")) return 360_000;
  if (p.includes("EPP") || p.includes("PEQUENO")) return 4_800_000;
  if (p.includes("DEMAIS") || p.includes("MÉDIO") || p.includes("MEDIO") || p.includes("GRANDE"))
    return undefined; // acima de 4,8 mi, sem teto público
  return undefined;
}

function yearsSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function computeLeadScore(lead: Pick<Lead,
  "dataAbertura" | "situacao" extends never ? never : never
  | "capitalSocial" | "porte" | "simplesOptante" | "inscricaoEstadual"
  | "socios" | "cnpj" | "razaoSocial"
> & { situacao?: string }): LeadScore {
  const reasons: { ok: boolean; text: string }[] = [];
  let score = 50; // baseline neutro

  // 1) Tempo de mercado (data de abertura)
  const anos = yearsSince(lead.dataAbertura);
  if (anos !== undefined) {
    if (anos >= 10) { score += 20; reasons.push({ ok: true, text: `Empresa consolidada (${Math.floor(anos)} anos de mercado)` }); }
    else if (anos >= 3) { score += 10; reasons.push({ ok: true, text: `${Math.floor(anos)} anos de mercado` }); }
    else if (anos >= 1) { score += 0; reasons.push({ ok: true, text: `${Math.floor(anos)} ano(s) de mercado` }); }
    else { score -= 15; reasons.push({ ok: false, text: "Empresa aberta há menos de 1 ano" }); }
  } else {
    reasons.push({ ok: false, text: "Data de abertura não informada" });
  }

  // 2) Inscrição Estadual ativa (proxy de atividade fiscal real)
  if (lead.inscricaoEstadual && lead.inscricaoEstadual.replace(/\D/g, "").length >= 6) {
    score += 8;
    reasons.push({ ok: true, text: "Inscrição estadual ativa" });
  } else {
    score -= 5;
    reasons.push({ ok: false, text: "Sem inscrição estadual ativa" });
  }

  // 3) Capital social vs porte (coerência)
  const cap = lead.capitalSocial ?? 0;
  const porte = (lead.porte ?? "").toUpperCase();
  if (cap > 0) {
    if (cap >= 1_000_000) { score += 12; reasons.push({ ok: true, text: `Capital social ≥ R$ 1 mi` }); }
    else if (cap >= 100_000) { score += 6; reasons.push({ ok: true, text: `Capital social R$ ${(cap/1000).toFixed(0)} mil` }); }
    else if (cap >= 10_000) { score += 2; }
    else if (porte.includes("DEMAIS") || porte.includes("GRANDE")) {
      score -= 8; reasons.push({ ok: false, text: "Capital social muito baixo para o porte declarado" });
    }
  }

  // 4) Simples Nacional — sinal neutro-positivo (empresa formalizada / ativa)
  if (lead.simplesOptante === true) {
    score += 3;
    reasons.push({ ok: true, text: "Optante pelo Simples Nacional" });
  }

  // 5) Quadro societário conhecido
  const nSocios = lead.socios?.length ?? 0;
  if (nSocios >= 2) { score += 4; reasons.push({ ok: true, text: `${nSocios} sócios identificados` }); }
  else if (nSocios === 1) { score += 2; }
  else { reasons.push({ ok: false, text: "Quadro societário não retornado" }); }

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  const level: ScoreLevel = score >= 70 ? "alto" : score >= 45 ? "medio" : "baixo";
  const meta = {
    alto:  { label: "Baixo risco",   emoji: "🟢", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    medio: { label: "Risco médio",   emoji: "🟡", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    baixo: { label: "Risco elevado", emoji: "🔴", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  }[level];

  return {
    score,
    level,
    label: meta.label,
    emoji: meta.emoji,
    className: meta.className,
    reasons,
    faturamentoEstimado: faturamentoTetoPorPorte(lead.porte),
  };
}
