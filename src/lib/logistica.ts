/**
 * Cálculos logísticos puros — sem dependência de rede/banco.
 * - Dimensões de produtos vêm em cm (padrão do cadastro).
 * - Dimensões úteis dos veículos vêm em metros.
 * - Peso em kg.
 *
 * Convenções:
 *   footprint do SKU = (largura × comprimento) em cm² (com opção girada 90°).
 *   coluna = uma pilha de N peças ("pecasPorColuna"), altura = height × N.
 */

export type FleetVehicleType =
  | "vuc"
  | "3_4"
  | "toco"
  | "truck"
  | "carreta"
  | "container_20"
  | "container_40"
  | "bitrem"
  | "rodotrem";

export type FleetVehicle = {
  id: string;
  nome: string;
  tipo: FleetVehicleType;
  comprimentoUtilM: number;
  larguraUtilM: number;
  alturaUtilM: number;
  capacidadeKg: number;
  rsPorKm: number;
  ativo: boolean;
};

export const DEFAULT_FLEET: FleetVehicle[] = [
  { id: "v-vuc",   nome: "VUC",          tipo: "vuc",          comprimentoUtilM: 4.5,  larguraUtilM: 2.0,  alturaUtilM: 2.2, capacidadeKg: 3000,  rsPorKm: 4.5,  ativo: true },
  { id: "v-34",    nome: "3/4",          tipo: "3_4",          comprimentoUtilM: 5.5,  larguraUtilM: 2.2,  alturaUtilM: 2.4, capacidadeKg: 4000,  rsPorKm: 5.2,  ativo: true },
  { id: "v-toco",  nome: "Toco",         tipo: "toco",         comprimentoUtilM: 6.5,  larguraUtilM: 2.4,  alturaUtilM: 2.6, capacidadeKg: 6000,  rsPorKm: 5.8,  ativo: true },
  { id: "v-truck", nome: "Truck",        tipo: "truck",        comprimentoUtilM: 7.5,  larguraUtilM: 2.4,  alturaUtilM: 2.7, capacidadeKg: 12000, rsPorKm: 6.5,  ativo: true },
  { id: "v-carr",  nome: "Carreta",      tipo: "carreta",      comprimentoUtilM: 14.0, larguraUtilM: 2.4,  alturaUtilM: 2.9, capacidadeKg: 27000, rsPorKm: 9.2,  ativo: true },
  { id: "v-c20",   nome: "Container 20'",tipo: "container_20", comprimentoUtilM: 5.9,  larguraUtilM: 2.35, alturaUtilM: 2.39,capacidadeKg: 22000, rsPorKm: 11.0, ativo: true },
  { id: "v-c40",   nome: "Container 40'",tipo: "container_40", comprimentoUtilM: 12.0, larguraUtilM: 2.35, alturaUtilM: 2.39,capacidadeKg: 27000, rsPorKm: 13.5, ativo: true },
  { id: "v-bi",    nome: "Bitrem",       tipo: "bitrem",       comprimentoUtilM: 19.8, larguraUtilM: 2.4,  alturaUtilM: 2.9, capacidadeKg: 37000, rsPorKm: 11.5, ativo: false },
  { id: "v-ro",    nome: "Rodotrem",     tipo: "rodotrem",     comprimentoUtilM: 30.0, larguraUtilM: 2.4,  alturaUtilM: 2.9, capacidadeKg: 45000, rsPorKm: 14.0, ativo: false },
];

// ============ Produto: cálculos derivados ============

export type ProdutoLog = {
  sku: string;
  name: string;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  pecasPorColuna: number;
  /**
   * Altura real do volume completo empilhado/aninhado (cm).
   * Quando definido, o motor usa este valor como altura da pilha em vez de
   * heightCm × pecasPorColuna. Ideal para produtos aninháveis (ex.: pallets
   * que encaixam dentro uns dos outros).
   */
  stackHeightCm?: number | null;
};

/** Volume unitário em m³. */
export function volumeUnitM3(p: Pick<ProdutoLog, "heightCm" | "widthCm" | "lengthCm">): number {
  return (p.heightCm * p.widthCm * p.lengthCm) / 1_000_000;
}

/** Altura da pilha em metros — usa stackHeightCm quando disponível (aninhamento). */
export function alturaPilhaM(p: Pick<ProdutoLog, "heightCm" | "pecasPorColuna" | "stackHeightCm">): number {
  if (p.stackHeightCm && p.stackHeightCm > 0) return p.stackHeightCm / 100;
  return (p.heightCm * Math.max(1, p.pecasPorColuna)) / 100;
}


/** Peso da pilha em kg. */
export function pesoPilhaKg(p: Pick<ProdutoLog, "weightKg" | "pecasPorColuna">): number {
  return p.weightKg * Math.max(1, p.pecasPorColuna);
}

/**
 * Quantas colunas cabem no piso do veículo — testa orientação normal e 90°.
 * Retorna o melhor arranjo.
 */
export function colunasNoPiso(
  p: Pick<ProdutoLog, "widthCm" | "lengthCm">,
  v: Pick<FleetVehicle, "comprimentoUtilM" | "larguraUtilM">,
): number {
  const compCm = v.comprimentoUtilM * 100;
  const largCm = v.larguraUtilM * 100;
  const W = Math.max(1, p.widthCm);
  const L = Math.max(1, p.lengthCm);
  const optA = Math.floor(compCm / L) * Math.floor(largCm / W);
  const optB = Math.floor(compCm / W) * Math.floor(largCm / L);
  return Math.max(0, optA, optB);
}

// ============ Item de proposta ============

export type ItemProposta = {
  produto: ProdutoLog;
  quantidade: number;
};

export type CalcVeiculo = {
  vehicleId: string;
  nome: string;
  tipo: FleetVehicleType;
  colunasPorVeiculo: number;    // colunas no piso × pecasPorColuna (limitado pela altura útil)
  pecasPorVeiculo: number;      // peças (unidades soltas)
  pecasPorVeiculoPeso: number;  // limite pela capacidade em kg
  veiculosNecessarios: number;
  limitante: "volume" | "peso" | "altura" | "cabe_zero";
  aproveitamentoPct: number;    // 0..100
  freteTotal: number;           // R$
  fretePorPeca: number;         // R$
  freteMedioPorVeiculo: number; // R$ por veículo
  avisos: string[];
};

export type CalcResultado = {
  totalPecas: number;
  totalPesoKg: number;
  totalVolumeM3: number;
  distanciaKm: number;
  veiculos: CalcVeiculo[];
  melhorVeiculoId: string | null; // menor R$/peça viável
};

/**
 * Núcleo do cálculo. `distanciaKm` já vem resolvido (do Google Maps ou 0 quando indisponível).
 */
export function calcularLogistica(
  itens: ItemProposta[],
  frota: FleetVehicle[],
  distanciaKm: number,
): CalcResultado {
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const totalPesoKg = itens.reduce((s, i) => s + i.produto.weightKg * i.quantidade, 0);
  const totalVolumeM3 = itens.reduce((s, i) => s + volumeUnitM3(i.produto) * i.quantidade, 0);

  const ativos = frota.filter((v) => v.ativo);
  const veiculos: CalcVeiculo[] = ativos.map((v) => calcularParaVeiculo(itens, v, distanciaKm));

  // menor R$/peça entre veículos que conseguem carregar (>0)
  const viaveis = veiculos.filter((r) => r.limitante !== "cabe_zero" && r.veiculosNecessarios > 0);
  const melhor = viaveis
    .slice()
    .sort((a, b) => a.fretePorPeca - b.fretePorPeca)[0];

  return {
    totalPecas,
    totalPesoKg,
    totalVolumeM3,
    distanciaKm,
    veiculos,
    melhorVeiculoId: melhor?.vehicleId ?? null,
  };
}

function calcularParaVeiculo(
  itens: ItemProposta[],
  v: FleetVehicle,
  distanciaKm: number,
): CalcVeiculo {
  const avisos: string[] = [];

  // Estratégia simplificada: por veículo, cada SKU é agrupado; assume-se
  // um SKU dominante — pega o de maior volume total e usa sua geometria
  // como referência de cabimento (footprint × pecasPorColuna).
  const dominante = itens
    .slice()
    .sort((a, b) => volumeUnitM3(b.produto) * b.quantidade - volumeUnitM3(a.produto) * a.quantidade)[0];
  if (!dominante) {
    return zeroResult(v, "cabe_zero");
  }

  const colunas = colunasNoPiso(dominante.produto, v);
  if (colunas === 0) {
    avisos.push("Produto não cabe no piso deste veículo");
    return { ...zeroResult(v, "cabe_zero"), avisos };
  }

  // Altura pode limitar peças por coluna.
  // Se o produto tem stack_height_cm (produto aninhável), a altura da pilha cheia
  // é esse valor — não heightCm × pecas_por_coluna. Se o veículo não comporta a
  // pilha cheia, prorrateamos linearmente.
  const alturaMax = v.alturaUtilM;
  const prod = dominante.produto;
  const stackCm = prod.stackHeightCm && prod.stackHeightCm > 0 ? prod.stackHeightCm : null;
  const alturaPilhaCheiaM = stackCm ? stackCm / 100 : (prod.heightCm / 100) * Math.max(1, prod.pecasPorColuna);
  let maxPecasPilhaAltura: number;
  if (stackCm) {
    // Produto aninhável — a pilha inteira ocupa stackCm de altura.
    if (alturaMax >= alturaPilhaCheiaM) {
      maxPecasPilhaAltura = prod.pecasPorColuna;
    } else {
      maxPecasPilhaAltura = Math.max(1, Math.floor(prod.pecasPorColuna * (alturaMax / alturaPilhaCheiaM)));
    }
  } else {
    const alturaPecaM = prod.heightCm / 100;
    maxPecasPilhaAltura = alturaPecaM > 0 ? Math.floor(alturaMax / alturaPecaM) : prod.pecasPorColuna;
  }
  const pecasPorPilha = Math.max(1, Math.min(prod.pecasPorColuna, maxPecasPilhaAltura));
  if (maxPecasPilhaAltura < prod.pecasPorColuna) {
    avisos.push(`Altura útil (${alturaMax.toFixed(2)}m) limita a pilha a ${maxPecasPilhaAltura} peças`);
  }

  const pecasPorVeiculoVolume = colunas * pecasPorPilha;

  // Peso — cada peça da carga inteira (média ponderada por SKU)
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const totalPeso = itens.reduce((s, i) => s + i.produto.weightKg * i.quantidade, 0);
  const pesoMedioPorPeca = totalPecas > 0 ? totalPeso / totalPecas : prod.weightKg;
  const pecasPorVeiculoPeso = pesoMedioPorPeca > 0 ? Math.floor(v.capacidadeKg / pesoMedioPorPeca) : pecasPorVeiculoVolume;

  const pecasPorVeiculo = Math.min(pecasPorVeiculoVolume, pecasPorVeiculoPeso);
  const limitante: CalcVeiculo["limitante"] =
    pecasPorVeiculoPeso < pecasPorVeiculoVolume
      ? "peso"
      : maxPecasPilhaAltura < prod.pecasPorColuna
        ? "altura"
        : "volume";


  const veiculosNecessarios = pecasPorVeiculo > 0 ? Math.ceil(totalPecas / pecasPorVeiculo) : 0;
  const pecasNoUltimo = veiculosNecessarios > 0 ? totalPecas - (veiculosNecessarios - 1) * pecasPorVeiculo : 0;
  const aproveitamentoUltimo = pecasPorVeiculo > 0 ? pecasNoUltimo / pecasPorVeiculo : 0;
  const aproveitamentoMedio =
    veiculosNecessarios > 0
      ? ((veiculosNecessarios - 1) * 1 + aproveitamentoUltimo) / veiculosNecessarios
      : 0;

  const freteTotal = distanciaKm * v.rsPorKm * veiculosNecessarios;
  const fretePorPeca = totalPecas > 0 ? freteTotal / totalPecas : 0;
  const freteMedioPorVeiculo = veiculosNecessarios > 0 ? freteTotal / veiculosNecessarios : 0;

  return {
    vehicleId: v.id,
    nome: v.nome,
    tipo: v.tipo,
    colunasPorVeiculo: pecasPorVeiculoVolume,
    pecasPorVeiculo,
    pecasPorVeiculoPeso,
    veiculosNecessarios,
    limitante,
    aproveitamentoPct: +(aproveitamentoMedio * 100).toFixed(1),
    freteTotal: +freteTotal.toFixed(2),
    fretePorPeca: +fretePorPeca.toFixed(2),
    freteMedioPorVeiculo: +freteMedioPorVeiculo.toFixed(2),
    avisos,
  };
}

function zeroResult(v: FleetVehicle, limitante: CalcVeiculo["limitante"]): CalcVeiculo {
  return {
    vehicleId: v.id,
    nome: v.nome,
    tipo: v.tipo,
    colunasPorVeiculo: 0,
    pecasPorVeiculo: 0,
    pecasPorVeiculoPeso: 0,
    veiculosNecessarios: 0,
    limitante,
    aproveitamentoPct: 0,
    freteTotal: 0,
    fretePorPeca: 0,
    freteMedioPorVeiculo: 0,
    avisos: [],
  };
}
