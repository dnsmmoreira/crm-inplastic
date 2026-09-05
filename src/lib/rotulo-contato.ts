/**
 * Rótulo consistente do cliente: contato (pessoa) + empresa.
 * Puro — sem acesso a banco. Usado em /conversas, /minha-agenda e listas de tarefas.
 */

export type RotuloInput = {
  /** Nome da pessoa (whatsapp_conversas.name ou leads.contact_name). */
  contato?: string | null;
  /** Razão social / nome fantasia do cliente ou leads.company. */
  empresa?: string | null;
  /** Telefone, usado apenas como último recurso. */
  telefone?: string | null;
};

export type Rotulo = {
  /** Linha principal (nunca vazia quando há algum dado). */
  principal: string;
  /** Linha secundária: empresa, apenas quando difere da principal. */
  secundario: string | null;
};

function limpo(v?: string | null): string {
  return (v ?? "").trim();
}

function mesmoTexto(a: string, b: string): boolean {
  return a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");
}

export function rotuloContato(input: RotuloInput): Rotulo {
  const contato = limpo(input.contato);
  const empresa = limpo(input.empresa);
  const telefone = limpo(input.telefone);

  const principal = contato || empresa || telefone;
  if (!principal) return { principal: "", secundario: null };

  const secundario = empresa && !mesmoTexto(empresa, principal) ? empresa : null;
  return { principal, secundario };
}

/** Mesma informação em uma linha só: "Contato · Empresa". */
export function rotuloLinha(input: RotuloInput): string {
  const { principal, secundario } = rotuloContato(input);
  return secundario ? `${principal} · ${secundario}` : principal;
}

/** Empresa preferida: razão social do cliente vinculado, senão fantasia, senão lead.company. */
export function empresaPreferida(
  cliente?: { razao_social?: string | null; nome_fantasia?: string | null } | null,
  leadCompany?: string | null,
): string | null {
  return limpo(cliente?.razao_social) || limpo(cliente?.nome_fantasia) || limpo(leadCompany) || null;
}
