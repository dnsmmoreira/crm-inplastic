/**
 * Pendências que IMPEDEM gerar o pedido (trava 1 da conferência final).
 *
 * Lógica pura, usada nos dois lados:
 *   - na tela (ConferenciaFinalDialog) com os dados carregados na proposta;
 *   - no servidor (`gerarPedidoInterno`) recalculada com dados do banco.
 *
 * "Retirada": não existe hoje um campo próprio de modalidade na proposta.
 * O que existe é `transport.carrier` com as opções especiais "Cliente retira" e
 * "Veículo próprio" (sem `carrierTransportadoraId`). Então tratamos como retirada
 * quando `retirada === true` (se algum dia existir o campo) OU quando a
 * transportadora escolhida casa com esses textos.
 */

import { isValidCnpj, isValidCpf } from "@/lib/cnpj";
import { tratativaValida } from "@/lib/tratativa-comercial";

export type PendenciaCodigo =
  | "cliente_sem_documento"
  | "cliente_sem_email_nf"
  | "sem_condicao_pagamento"
  | "sem_entrega"
  | "sem_previsao_entrega"
  | "sem_tratativa"
  | "item_sem_catalogo"
  | "item_sem_peso"
  | "item_invalido";

export type Pendencia = { codigo: PendenciaCodigo; mensagem: string; link?: string };

export type PendenciaItemInput = {
  id: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  productId?: string | null;
  /** Peso do produto do catálogo (produtos.weight_kg). */
  pesoKg?: number | null;
};

export type PendenciaInput = {
  cliente: {
    clienteId?: string | null;
    leadId?: string | null;
    nome?: string | null;
    tipoPessoa?: string | null;
    cnpj?: string | null;
    cpf?: string | null;
    emailNf?: string | null;
  };
  paymentTermId?: string | null;
  transporte?: {
    freightPayer?: string | null;
    carrier?: string | null;
    deliveryAddress?: string | null;
    deliveryCep?: string | null;
    retirada?: boolean | null;
  } | null;
  expectedDeliveryDate?: string | null;
  tratativa?: string | null;
  itens: PendenciaItemInput[];
};

const txt = (v: unknown) => String(v ?? "").trim();

function emailValido(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Retirada na fábrica — ver nota no topo do arquivo. */
export function ehRetirada(t: PendenciaInput["transporte"]): boolean {
  if (t?.retirada === true) return true;
  const c = txt(t?.carrier).toLowerCase();
  if (!c) return false;
  return /retira|retirada|ve[íi]culo pr[óo]prio/.test(c);
}

function linkDoCliente(c: PendenciaInput["cliente"]): string | undefined {
  if (c.clienteId) return `/clientes?editar=${c.clienteId}`;
  if (c.leadId) return `/leads?lead=${c.leadId}`;
  return undefined;
}

/** Todas as pendências bloqueiam a geração do pedido. */
export function calcularPendenciasPedido(input: PendenciaInput): Pendencia[] {
  const out: Pendencia[] = [];
  const linkCliente = linkDoCliente(input.cliente);
  const add = (codigo: PendenciaCodigo, mensagem: string, link?: string) =>
    out.push(link ? { codigo, mensagem, link } : { codigo, mensagem });

  // --- Cliente -------------------------------------------------------------
  const cnpj = txt(input.cliente.cnpj);
  const cpf = txt(input.cliente.cpf);
  const documentoOk = (cnpj && isValidCnpj(cnpj)) || (cpf && isValidCpf(cpf));
  const nomeOk = txt(input.cliente.nome).length > 0;
  if (!documentoOk || !nomeOk) {
    add(
      "cliente_sem_documento",
      !nomeOk && !documentoOk
        ? "Cliente sem razão social/nome e sem CNPJ ou CPF válido."
        : !nomeOk
          ? "Cliente sem razão social/nome cadastrado."
          : "Cliente sem CNPJ ou CPF válido.",
      linkCliente,
    );
  }

  if (input.cliente.clienteId) {
    const emailNf = txt(input.cliente.emailNf);
    if (!emailNf || !emailValido(emailNf)) {
      add(
        "cliente_sem_email_nf",
        "Cliente sem e-mail válido para envio da nota fiscal.",
        linkCliente,
      );
    }
  }

  // --- Proposta ------------------------------------------------------------
  if (!txt(input.paymentTermId)) {
    add("sem_condicao_pagamento", "Selecione a condição de pagamento da proposta.");
  }

  const temEndereco =
    txt(input.transporte?.deliveryAddress).length > 0 ||
    txt(input.transporte?.deliveryCep).length > 0;
  if (!temEndereco && !ehRetirada(input.transporte)) {
    add(
      "sem_entrega",
      "Informe o endereço (ou CEP) de entrega, ou marque que o cliente retira.",
    );
  }

  if (!txt(input.expectedDeliveryDate)) {
    add("sem_previsao_entrega", "Informe a previsão de entrega da proposta.");
  }

  if (!tratativaValida(input.tratativa)) {
    add(
      "sem_tratativa",
      "Registre a tratativa comercial (mínimo 20 caracteres) antes de gerar o pedido.",
    );
  }

  // --- Itens ---------------------------------------------------------------
  for (const it of input.itens) {
    const nome = txt(it.description) || "sem descrição";
    if (!txt(it.productId)) {
      add(
        "item_sem_catalogo",
        `Item "${nome}" não está vinculado ao catálogo — selecione o produto cadastrado.`,
      );
    } else if (!(Number(it.pesoKg ?? 0) > 0)) {
      add(
        "item_sem_peso",
        `Produto do item "${nome}" está sem peso cadastrado.`,
        `/produtos?editar=${it.productId}`,
      );
    }
    if (!(Number(it.quantity) > 0) || !(Number(it.unitPrice) > 0)) {
      add("item_invalido", `Item "${nome}" precisa de quantidade e preço unitário maiores que zero.`);
    }
  }

  return out;
}

/* ------------------------- Trava 2 — aprovação do cliente ------------------------- */

export const MEIOS_APROVACAO_CLIENTE = [
  "email",
  "whatsapp",
  "pedido_compra",
  "telefone",
  "presencial",
] as const;

export type MeioAprovacaoCliente = (typeof MEIOS_APROVACAO_CLIENTE)[number];

export const MEIO_APROVACAO_LABEL: Record<MeioAprovacaoCliente, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  pedido_compra: "Pedido de compra / OC",
  telefone: "Telefone",
  presencial: "Presencial",
};

export const DETALHE_APROVACAO_MIN_CHARS = 10;

export function meioAprovacaoValido(v: unknown): v is MeioAprovacaoCliente {
  return MEIOS_APROVACAO_CLIENTE.includes(String(v ?? "") as MeioAprovacaoCliente);
}

export function detalheAprovacaoValido(v: unknown): boolean {
  return txt(v).length >= DETALHE_APROVACAO_MIN_CHARS;
}

export function aprovacaoClienteValida(v: { meio?: unknown; detalhe?: unknown } | null | undefined) {
  return meioAprovacaoValido(v?.meio) && detalheAprovacaoValido(v?.detalhe);
}

/** Rótulo legível do meio (fallback: o próprio valor). */
export function rotuloMeioAprovacao(meio: string | null | undefined): string {
  return meioAprovacaoValido(meio) ? MEIO_APROVACAO_LABEL[meio] : txt(meio);
}
