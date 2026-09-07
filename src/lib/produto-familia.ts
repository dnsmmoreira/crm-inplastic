/**
 * Família (modelo) do produto — puro e testável.
 *
 * O catálogo tem 1 SKU por COR ("ED5050 AZL", "ED5050 BRC"…). O lead aponta
 * para a FAMÍLIA/modelo ("ED5050"); a cor é decidida na proposta.
 */

/** Sufixos de cor usados nos SKUs. */
export const CORES_SKU = [
  "AZL",
  "BRC",
  "CNZ",
  "NAT",
  "NTR",
  "PRT",
  "AMR",
  "LRJ",
  "VRD",
  "VER",
  "VRM",
  "RSA",
] as const;

/** Palavras de cor usadas nos NOMES dos produtos. */
const CORES_NOME = [
  "AZUL",
  "BRANCO",
  "BRANCA",
  "CINZA",
  "NATURAL",
  "PRETO",
  "PRETA",
  "AMARELO",
  "AMARELA",
  "LARANJA",
  "VERDE",
  "VERMELHO",
  "VERMELHA",
  "ROSA",
];

/** SKUs cujo agrupamento não sai só removendo a cor. */
const ALIAS_SKU_FAMILIA: Record<string, string> = {
  "EXLS 1210": "EXLS",
};

/** Família a partir do SKU: remove sufixos de cor (pode haver mais de um). */
export function familiaDoSku(sku: string | null | undefined): string {
  let s = String(sku ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!s) return "";
  const re = new RegExp(`\\s(${CORES_SKU.join("|")})$`);
  while (re.test(s)) s = s.replace(re, "");
  return ALIAS_SKU_FAMILIA[s] ?? s;
}

function semCor(nome: string): string {
  let n = String(nome ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const re = new RegExp(`\\s(${CORES_NOME.join("|")})$`);
  while (re.test(n)) n = n.replace(re, "");
  return n;
}

/** Rótulo da família: nome do produto sem a cor ("PALLET ESTRADO ED5050"). */
export function rotuloFamilia(produtos: { name?: string | null; sku?: string | null }[]): string {
  const nomes = produtos.map((p) => semCor(p.name ?? "")).filter((n) => n.length > 0);
  if (nomes.length === 0) return familiaDoSku(produtos[0]?.sku ?? "");
  // O rótulo mais curto entre os nomes já sem cor evita sobras ("CINZA PRETO").
  const ordenados = [...nomes].sort((a, b) => a.length - b.length || a.localeCompare(b));
  return ordenados[0];
}

/** Normaliza texto livre: minúsculo, sem acento, sem pontuação. */
export function normalizarTextoProduto(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Regra = { familia: string; teste: (t: string) => boolean };

/** Ordem importa: EXCL antes de EX, MDCL antes de MD. */
const REGRAS: Regra[] = [
  { familia: "EXLS", teste: (t) => /\bexcl\b|\bexls\b/.test(t) },
  { familia: "MDLS", teste: (t) => /\bmdcl\b|\bmdls\b/.test(t) },
  { familia: "EX1210", teste: (t) => /\bex\s?1210\b/.test(t) },
  { familia: "MDLS", teste: (t) => /\bmd\s?1210\b/.test(t) },
  { familia: "HV6", teste: (t) => /\bhv\s?6\b/.test(t) },
  { familia: "HV3", teste: (t) => /\bhv\s?3\b/.test(t) },
  { familia: "HV5", teste: (t) => /\bhv\s?5\b/.test(t) },
  { familia: "ED5050", teste: (t) => /\bed\s?5050\b|\b5050\b|\b50\s?x\s?50\b/.test(t) },
  { familia: "ED2550", teste: (t) => /\bed\s?2550\b|\b2550\b|\b25\s?x\s?50\b/.test(t) },
  { familia: "ED2525", teste: (t) => /\bed\s?2525\b|\b2525\b|\b25\s?x\s?25\b/.test(t) },
  { familia: "ED8241", teste: (t) => /\bed\s?8241\b|\b8241\b/.test(t) },
  {
    familia: "CT IBC 1000L",
    teste: (t) => /\bibc\b/.test(t) && /\bcontenc/.test(t),
  },
  { familia: "IBC 1000", teste: (t) => /\bibc\b/.test(t) && !/\bcontenc/.test(t) },
  {
    familia: "CT1 AT",
    teste: (t) => /\bcontenc\w*\b.*\b(1|um)\s?tambor\b/.test(t) || /\b1\s?tambor\b/.test(t),
  },
  { familia: "CT2 AT", teste: (t) => /\b2\s?tambor(es)?\b/.test(t) && /\balto\b/.test(t) },
  { familia: "CT2 BX", teste: (t) => /\b2\s?tambor(es)?\b/.test(t) && /\bbaix\w*\b/.test(t) },
  { familia: "CT4 AT", teste: (t) => /\b4\s?tambor(es)?\b/.test(t) && /\balto\b/.test(t) },
  { familia: "CT4 BX", teste: (t) => /\b4\s?tambor(es)?\b/.test(t) && /\bbaix\w*\b/.test(t) },
  { familia: "LX PED 15", teste: (t) => /\blixeira\b.*\bpedal\b.*\b15\b|\bpedal\b.*\b15\s?l/.test(t) },
  { familia: "LX PED 25", teste: (t) => /\blixeira\b.*\bpedal\b.*\b25\b|\bpedal\b.*\b25\s?l/.test(t) },
  { familia: "LX PED 100", teste: (t) => /\blixeira\b.*\bpedal\b.*\b100\b/.test(t) },
  { familia: "LX 240", teste: (t) => /\bcontentor\b|\b240\s?l\b/.test(t) },
  { familia: "CS 13", teste: (t) => /\bcesto\b.*\b13\b/.test(t) },
  { familia: "CS 30", teste: (t) => /\bcesto\b.*\b30\b/.test(t) },
  { familia: "CS 03", teste: (t) => /\bcesto\b.*\b(03|3)\b/.test(t) },
  { familia: "ALC 6437", teste: (t) => /\balc\b.*\b6437\b/.test(t) },
  { familia: "CX HTF 48", teste: (t) => /\bhortifruti\b.*\bombreira\b|\bhtf\b.*\b48\b/.test(t) },
  { familia: "CX HTF 49 RT", teste: (t) => /\bhortifruti\b.*\breta\b|\bhtf\b.*\b49\b/.test(t) },
];

/**
 * Infere a família a partir do texto livre do lead.
 * Devolve null quando genérico ("pallets", "pallet plástico") ou quando a
 * família encontrada não existe no catálogo informado.
 */
export function inferirFamilia(
  textoLivre: string | null | undefined,
  familias: string[],
): string | null {
  const t = normalizarTextoProduto(textoLivre);
  if (!t) return null;
  const disponiveis = new Set(familias.map((f) => f.trim().toUpperCase()));
  const encontradas = new Set<string>();
  for (const r of REGRAS) if (r.teste(t)) encontradas.add(r.familia);
  // Mais de um modelo citado ("HV5 ou HV6") → ambíguo, não adivinha.
  if (encontradas.size !== 1) return null;
  const familia = [...encontradas][0];
  return disponiveis.has(familia) ? familia : null;
}
