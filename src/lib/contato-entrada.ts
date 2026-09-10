/**
 * Porta de entrada única de contato (regras puras, sem banco).
 *
 * Quando um contato chega por qualquer canal, a ordem é sempre a mesma:
 *   1. cliente da carteira (telefone ou CNPJ)  → vai ao dono dele
 *   2. lead ativo (telefone ou CNPJ)           → reaproveita o lead existente
 *   3. nada bateu                              → lead novo + rodízio
 *
 * Nome/empresa NUNCA vinculam sozinhos: no máximo levantam a suspeita de
 * duplicidade para um humano decidir.
 */
import { chaveTelefone, chaveCnpj } from "@/lib/carteira-match";

export type AlvoCarteira = { clienteId: string | null; leadId: string | null; vendedorId: string; origem: string } | null;
export type AlvoLeadAtivo = { leadId: string; ownerId: string | null; stage: string; company: string | null; origem: string } | null;

export type DecisaoEntrada =
  | { acao: "carteira"; leadId: string | null; clienteId: string | null; vendedorId: string; origem: string }
  | { acao: "lead_existente"; leadId: string; vendedorId: string | null; origem: string }
  | { acao: "criar_lead" };

/**
 * `conversaLeadId` é o lead já vinculado à conversa (se houver): ele tem
 * precedência sobre qualquer casamento, para não trocar o atendimento em curso.
 */
export function decidirEntrada(input: {
  conversaLeadId?: string | null;
  carteira: AlvoCarteira;
  leadAtivo: AlvoLeadAtivo;
}): DecisaoEntrada {
  const { conversaLeadId, carteira, leadAtivo } = input;

  if (conversaLeadId) {
    return { acao: "lead_existente", leadId: conversaLeadId, vendedorId: null, origem: "conversa" };
  }
  if (carteira?.vendedorId) {
    return {
      acao: "carteira",
      leadId: carteira.leadId,
      clienteId: carteira.clienteId,
      vendedorId: carteira.vendedorId,
      origem: carteira.origem,
    };
  }
  if (leadAtivo?.leadId) {
    return {
      acao: "lead_existente",
      leadId: leadAtivo.leadId,
      vendedorId: leadAtivo.ownerId ?? null,
      origem: leadAtivo.origem,
    };
  }
  return { acao: "criar_lead" };
}

/** Há chave forte (telefone ou CNPJ) para consultar? */
export function temChaveForte(input: { telefone?: string | null; cnpj?: string | null }): boolean {
  return Boolean(chaveTelefone(input.telefone ?? null) || chaveCnpj(input.cnpj ?? null));
}

/** Normaliza nome de empresa para comparação frouxa (só aviso, nunca merge). */
export function normalizarNomeEmpresa(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|com|industria|ind|de|da|do|dos|das|e)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Suspeita de duplicidade por nome — apenas para avisar o vendedor. */
export function possivelDuplicidadePorNome(
  novo: string | null | undefined,
  existente: string | null | undefined,
): boolean {
  const a = normalizarNomeEmpresa(novo);
  const b = normalizarNomeEmpresa(existente);
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return a === b || a.includes(b) || b.includes(a);
}
