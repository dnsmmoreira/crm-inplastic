/**
 * Agregação do "Mix de produtos" do dashboard.
 * Função pura: agrupa por produto normalizado (ou productId/SKU quando existir),
 * ordena por valor e limita a top N + "Outros".
 */

export const OUTROS_LABEL = "Outros";

export type MixEntradaProduto = {
  product?: string | null;
  productId?: string | null;
  valor: number;
};

export type MixFatia = {
  key: string;
  name: string;
  value: number;
};

export function normalizarNomeProduto(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Trunca para exibição preservando o texto completo no `title`. */
export function truncarRotulo(v: string, max = 32): string {
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1).trimEnd()}…`;
}

export function agregarMixProdutos(entradas: MixEntradaProduto[], topN = 6): MixFatia[] {
  const map = new Map<string, MixFatia>();
  for (const e of entradas) {
    const nome = (e.product ?? "").trim().replace(/\s+/g, " ");
    const norm = normalizarNomeProduto(e.product);
    const id = (e.productId ?? "").trim();
    if (!id && !norm) continue;
    const key = id || norm;
    const valor = Number.isFinite(e.valor) ? e.valor : 0;
    const atual = map.get(key);
    if (atual) atual.value += valor;
    else map.set(key, { key, name: nome || id, value: valor });
  }

  const todos = Array.from(map.values()).sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
  if (todos.length <= topN + 1) return todos;

  const top = todos.slice(0, topN);
  const resto = todos.slice(topN).reduce((s, f) => s + f.value, 0);
  return [...top, { key: "__outros__", name: OUTROS_LABEL, value: resto }];
}
