import { useMemo } from "react";
import { useCrm } from "@/lib/crm-store";
import { familiaDoSku, rotuloFamilia } from "@/lib/produto-familia";

export type FamiliaCatalogo = {
  /** Chave da família ("ED5050"). */
  familia: string;
  /** Rótulo sem a cor ("PALLET ESTRADO ED5050"). */
  rotulo: string;
  /** SKU representante da família (primeiro ativo por nome). */
  representanteId: string;
};

/** Famílias/modelos do catálogo (uma linha por modelo, sem repetir cores). */
export function useFamiliasProduto(): FamiliaCatalogo[] {
  const products = useCrm((s) => s.products);
  return useMemo(() => {
    const grupos = new Map<string, typeof products>();
    for (const p of products) {
      const fam = (p.familia ?? "").trim().toUpperCase() || familiaDoSku(p.sku);
      if (!fam) continue;
      const atual = grupos.get(fam);
      if (atual) atual.push(p);
      else grupos.set(fam, [p]);
    }
    const out: FamiliaCatalogo[] = [];
    for (const [familia, itens] of grupos) {
      const ordenados = [...itens].sort(
        (a, b) => Number(!!b.active) - Number(!!a.active) || a.name.localeCompare(b.name),
      );
      out.push({
        familia,
        rotulo: rotuloFamilia(ordenados),
        representanteId: ordenados[0].id,
      });
    }
    return out.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  }, [products]);
}

/** Mapa productId → família (para agrupar o mix do dashboard). */
export function useFamiliaPorProduto(): Map<string, { familia: string; rotulo: string }> {
  const products = useCrm((s) => s.products);
  const familias = useFamiliasProduto();
  return useMemo(() => {
    const rotuloPorFamilia = new Map(familias.map((f) => [f.familia, f.rotulo]));
    const m = new Map<string, { familia: string; rotulo: string }>();
    for (const p of products) {
      const fam = (p.familia ?? "").trim().toUpperCase() || familiaDoSku(p.sku);
      if (!fam) continue;
      m.set(p.id, { familia: fam, rotulo: rotuloPorFamilia.get(fam) ?? fam });
    }
    return m;
  }, [products, familias]);
}
