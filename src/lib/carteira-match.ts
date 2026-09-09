/**
 * Casamento de contato com a CARTEIRA (regra pura, sem banco).
 *
 * A carteira manda: se o telefone/CNPJ/e-mail já é de um cliente da casa, o
 * contato pertence ao vendedor daquele cliente — nunca à fila.
 *
 * Telefone BR é ambíguo (com/sem DDI 55, com/sem o 9º dígito do celular). A
 * chave de comparação é sempre DDD + os ÚLTIMOS 8 dígitos:
 *   34997793330 ≡ (34) 99779-3330 ≡ 5534997793330 ≡ 3497793330
 */

export function soDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** DDD + últimos 8 dígitos, ou null quando não parece telefone BR com DDD. */
export function chaveTelefone(v: string | null | undefined): string | null {
  let d = soDigitos(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length < 8) return null;
  return ddd + resto.slice(-8);
}

export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = chaveTelefone(a);
  const kb = chaveTelefone(b);
  return ka != null && ka === kb;
}

/** 14 dígitos ou null. */
export function chaveCnpj(v: string | null | undefined): string | null {
  const d = soDigitos(v);
  return d.length === 14 ? d : null;
}

export function chaveEmail(v: string | null | undefined): string | null {
  const e = String(v ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export type ChavesContato = {
  telefone: string | null;
  cnpj: string | null;
  email: string | null;
};

export function chavesDoContato(input: {
  telefone?: string | null;
  cnpj?: string | null;
  email?: string | null;
}): ChavesContato {
  return {
    telefone: chaveTelefone(input.telefone),
    cnpj: chaveCnpj(input.cnpj),
    email: chaveEmail(input.email),
  };
}

/** Há alguma chave utilizável para consultar a carteira? */
export function temChave(c: ChavesContato): boolean {
  return Boolean(c.telefone || c.cnpj || c.email);
}

export type ConversaParaCarteira = { id: string; leadId: string | null };
export type MatchParaCarteira = { leadId: string | null; vendedorId: string; origem: string };
/** Lead que o match apontou (quando é lead_aberto). */
export type LeadCasado = {
  ownerId: string | null;
  ultimoContatoEm: string | null;
  /** Status da conversa desse lead casado, se existir. */
  statusConversa?: string | null;
} | null;

/**
 * A conversa deve ser entregue ao vendedor da carteira?
 *
 * Cliente da casa (cliente ativo ou lead ganho) sempre sim. Lead ABERTO só
 * conta quando é outro lead, já trabalhado por um humano e que não está sendo
 * atendido pela IA — senão todo prospect novo casaria consigo mesmo e mataria
 * o atendimento automático.
 */
export function decidirCarteiraNaConversa(
  conv: ConversaParaCarteira,
  match: MatchParaCarteira,
  leadCasado: LeadCasado = null,
): boolean {
  if (!match?.vendedorId) return false;
  const origem = String(match.origem ?? "");

  // O match é o próprio lead da conversa: não é "cliente da casa".
  if (match.leadId && conv.leadId && match.leadId === conv.leadId) return false;

  if (origem.startsWith("cliente:") || origem.startsWith("lead_ganho:")) return true;

  if (origem.startsWith("lead_aberto:")) {
    if (!match.leadId || match.leadId === conv.leadId) return false;
    if (!leadCasado?.ownerId || !leadCasado.ultimoContatoEm) return false;
    if (leadCasado.statusConversa === "ia_atendendo") return false;
    return true;
  }

  return false;
}

