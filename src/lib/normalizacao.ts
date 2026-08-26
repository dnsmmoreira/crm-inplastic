/**
 * Normalização de dados de cadastro (leads, contatos, clientes).
 * - Texto (nome/empresa/endereço): trim + colapso de espaços + MAIÚSCULO.
 * - E-mail: trim + minúsculo.
 * - Telefone: APENAS formatação de exibição — nunca altera dado gravado.
 */

export function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    // Nunca deve chegar objeto aqui, mas não pode derrubar o fluxo do chamador.
    console.warn("[normalizarTexto] valor não-textual recebido:", valor);
    return "";
  }
  return String(valor).trim().replace(/\s+/g, " ").toUpperCase();
}


export function normalizarEmail(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return valor.trim().toLowerCase();
}

/**
 * Formata telefone BR para exibição. Se o valor não parecer um telefone BR
 * válido, devolve o valor original inalterado. Nunca lança exceção.
 */
export function formatarTelefoneBR(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const original = String(valor);
  let d = original.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return original;
}
