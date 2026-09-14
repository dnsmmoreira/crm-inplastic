/**
 * Ficha de Coleta — regras puras (sem acesso a banco).
 *
 * Decisões fechadas com a diretoria:
 * - Numeração COL-AAAA-NNNNNN, gerada no banco com trava, nunca reaproveitada.
 * - Peso/cubagem vêm do cadastro do produto; ZERO ou ausente NÃO vale como dado:
 *   exige entrada manual, marcada como manual (auditável, nunca silenciosa).
 * - Depois de emitida, a ficha é imutável: só cancelar e gerar outra.
 */

export const FICHA_STATUS = [
  "rascunho",
  "emitida",
  "em_coleta",
  "coletada",
  "cancelada",
] as const;

export type FichaStatus = (typeof FICHA_STATUS)[number];

export const FICHA_STATUS_LABEL: Record<FichaStatus, string> = {
  rascunho: "Rascunho",
  emitida: "Emitida",
  em_coleta: "Em coleta",
  coletada: "Coletada",
  cancelada: "Cancelada",
};

/** Transições válidas do ciclo de vida. Cancelar só antes de concluir. */
const TRANSICOES: Record<FichaStatus, FichaStatus[]> = {
  rascunho: ["emitida", "cancelada"],
  emitida: ["em_coleta", "coletada", "cancelada"],
  em_coleta: ["coletada", "cancelada"],
  coletada: [],
  cancelada: [],
};

export function podeTransicionarFicha(de: FichaStatus, para: FichaStatus): boolean {
  return (TRANSICOES[de] ?? []).includes(para);
}

/** Só o rascunho é editável — depois vale o snapshot congelado. */
export function fichaEditavel(status: FichaStatus): boolean {
  return status === "rascunho";
}

export function fichaFechada(status: FichaStatus): boolean {
  return status === "coletada" || status === "cancelada";
}

export type ProdutoMedidas = {
  weight_kg?: number | null;
  height_cm?: number | null;
  width_cm?: number | null;
  length_cm?: number | null;
};

/** Número positivo e finito; 0, negativo, null e NaN contam como ausente. */
function positivo(v: number | null | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Peso unitário do produto em kg, ou null quando o cadastro não tem o dado. */
export function pesoUnitarioProduto(p: ProdutoMedidas | null | undefined): number | null {
  return positivo(p?.weight_kg);
}

/** Cubagem unitária em m³ a partir das dimensões em cm; null se faltar alguma. */
export function cubagemUnitariaProduto(p: ProdutoMedidas | null | undefined): number | null {
  const h = positivo(p?.height_cm);
  const w = positivo(p?.width_cm);
  const l = positivo(p?.length_cm);
  if (h === null || w === null || l === null) return null;
  return arred((h * w * l) / 1_000_000, 4);
}

export function arred(v: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
}

export type FichaItemCalculo = {
  quantidade: number;
  /** Peso TOTAL do item (kg), já multiplicado pela quantidade. */
  peso_kg: number | null;
  /** Cubagem TOTAL do item (m³). */
  cubagem_m3: number | null;
  peso_manual: boolean;
  cubagem_manual: boolean;
};

/**
 * Deriva peso e cubagem do item a partir do cadastro do produto.
 * Quando o produto não tem o dado (ausente ou zero), devolve null — a tela
 * obriga a digitar e marca como manual.
 */
export function derivarItemDoProduto(
  produto: ProdutoMedidas | null | undefined,
  quantidade: number,
): FichaItemCalculo {
  const qtd = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
  const pesoUn = pesoUnitarioProduto(produto);
  const cubUn = cubagemUnitariaProduto(produto);
  return {
    quantidade: qtd,
    peso_kg: pesoUn === null ? null : arred(pesoUn * qtd, 3),
    cubagem_m3: cubUn === null ? null : arred(cubUn * qtd, 4),
    peso_manual: false,
    cubagem_manual: false,
  };
}

export type FichaItemTotais = {
  peso_kg: number | null;
  cubagem_m3: number | null;
};

export function totaisFicha(itens: FichaItemTotais[]): { peso_kg: number; cubagem_m3: number } {
  let peso = 0;
  let cub = 0;
  for (const i of itens) {
    peso += Number(i.peso_kg ?? 0);
    cub += Number(i.cubagem_m3 ?? 0);
  }
  return { peso_kg: arred(peso, 3), cubagem_m3: arred(cub, 4) };
}

/** Itens ainda sem peso ou sem cubagem — bloqueiam a emissão. */
export function itensSemMedida<T extends FichaItemTotais>(itens: T[]): T[] {
  return itens.filter((i) => positivo(i.peso_kg) === null || positivo(i.cubagem_m3) === null);
}

export type ValidacaoEmissao = { ok: true } | { ok: false; motivo: string };

export function validarEmissao(input: {
  status: FichaStatus;
  itens: FichaItemTotais[];
  contato_nome?: string | null;
  contato_telefone?: string | null;
}): ValidacaoEmissao {
  if (input.status !== "rascunho")
    return { ok: false, motivo: "Só um rascunho pode ser emitido." };
  if (input.itens.length === 0)
    return { ok: false, motivo: "A ficha precisa de ao menos um item." };
  const faltando = itensSemMedida(input.itens);
  if (faltando.length > 0)
    return {
      ok: false,
      motivo: `Informe peso e cubagem de ${faltando.length} item(ns) antes de emitir.`,
    };
  if (!String(input.contato_nome ?? "").trim() || !String(input.contato_telefone ?? "").trim())
    return { ok: false, motivo: "Informe o contato responsável pela coleta." };
  return { ok: true };
}

/** COL-AAAA-NNNNNN — validação do formato gerado pelo banco. */
export function numeroFichaValido(numero: string): boolean {
  return /^COL-\d{4}-\d{6}$/.test(String(numero ?? "").trim());
}

export function formatarPeso(kg: number | null | undefined): string {
  const n = Number(kg ?? 0);
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
}

export function formatarCubagem(m3: number | null | undefined): string {
  const n = Number(m3 ?? 0);
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 })} m³`;
}
