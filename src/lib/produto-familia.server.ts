/**
 * Resolve o produto "representante" da família a partir do texto livre do lead.
 * Usado na criação automática de leads (IA/site). Nunca derruba o fluxo:
 * qualquer falha devolve null e o lead nasce sem product_id.
 */

import { inferirFamilia } from "@/lib/produto-familia";

type SupabaseLike = {
  from: (t: string) => {
    select: (c: string) => {
      not: (
        col: string,
        op: string,
        val: unknown,
      ) => Promise<{ data: { id: string; familia: string | null; active: boolean | null; name: string | null }[] | null; error: unknown }>;
    };
  };
};

export async function resolverProdutoIdPorTexto(
  supabase: unknown,
  textoLivre: string | null | undefined,
): Promise<string | null> {
  const texto = String(textoLivre ?? "").trim();
  if (!texto) return null;
  try {
    const sb = supabase as SupabaseLike;
    const { data, error } = await sb
      .from("produtos")
      .select("id, familia, active, name")
      .not("familia", "is", null);
    if (error || !data?.length) return null;

    const familias = Array.from(new Set(data.map((p) => (p.familia ?? "").trim()).filter(Boolean)));
    const familia = inferirFamilia(texto, familias);
    if (!familia) return null;

    const candidatos = data
      .filter((p) => (p.familia ?? "").trim().toUpperCase() === familia)
      .sort(
        (a, b) =>
          Number(!!b.active) - Number(!!a.active) || (a.name ?? "").localeCompare(b.name ?? ""),
      );
    return candidatos[0]?.id ?? null;
  } catch (e) {
    console.warn("[resolverProdutoIdPorTexto] falhou:", e);
    return null;
  }
}
