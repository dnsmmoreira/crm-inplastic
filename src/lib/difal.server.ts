/**
 * DIFAL no SERVIDOR — uma única leitura dos dados fiscais do destinatário e uma
 * única chamada de `calcularDifal`.
 *
 * Existe para que a proposta mostrada ao cliente e o pedido gerado a partir
 * dela usem exatamente a mesma conta: o pedido nascia sem o DIFAL (o valor era
 * reconstruído dos itens), então cliente aprovava um valor e o financeiro
 * recebia outro.
 */
import { calcularDifal, DIFAL_ALIQUOTAS_PADRAO, type DifalResultado } from "@/lib/difal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/** Dados fiscais do destinatário: o cliente manda, o lead é o fallback. */
export async function dadosFiscaisDoLead(
  sb: SB,
  leadId: string | null | undefined,
): Promise<{ uf: string | null; inscricaoEstadual: string | null; ieIsento: boolean }> {
  if (!leadId) return { uf: null, inscricaoEstadual: null, ieIsento: false };
  const { data: lead } = await sb
    .from("leads")
    .select("estado, inscricao_estadual, cliente_id, endereco")
    .eq("id", leadId)
    .maybeSingle();
  // O cadastro do CRM grava a UF dentro do jsonb `endereco`; a coluna `estado`
  // só existe em leads antigos/importados. Sem este fallback o DIFAL saía zero
  // no pedido e ele nascia menor que o total aprovado na proposta.
  const end = (lead?.endereco ?? null) as { uf?: string | null; estado?: string | null } | null;
  let uf = (lead?.estado as string | null) ?? end?.uf ?? end?.estado ?? null;
  let ie = (lead?.inscricao_estadual as string | null) ?? null;
  let isento = false;
  if (lead?.cliente_id) {
    const { data: cli } = await sb
      .from("clientes")
      .select("estado, inscricao_estadual, ie_isento")
      .eq("id", lead.cliente_id)
      .maybeSingle();
    uf = (cli?.estado as string | null) ?? uf;
    ie = (cli?.inscricao_estadual as string | null) ?? ie;
    isento = !!cli?.ie_isento;
  }
  return { uf, inscricaoEstadual: ie, ieIsento: isento };
}

/** Tabela de alíquotas do banco, com o padrão como fallback. */
export async function aliquotasDifal(sb: SB) {
  const { data } = await sb
    .from("difal_aliquotas")
    .select("uf, aliquota_interna, aliquota_interestadual");
  return data?.length ? data : DIFAL_ALIQUOTAS_PADRAO;
}

/**
 * DIFAL de uma proposta/pedido a partir do lead.
 * `valorOperacao` = subtotal com desconto e acréscimo, SEM frete.
 */
export async function difalDoDestinatario(
  sb: SB,
  args: {
    leadId: string | null | undefined;
    valorOperacao: number;
    /** Dados fiscais já carregados (evita reler cliente/lead). */
    fiscais?: { uf: string | null; inscricaoEstadual: string | null; ieIsento: boolean };
  },
): Promise<DifalResultado> {
  const fiscais = args.fiscais ?? (await dadosFiscaisDoLead(sb, args.leadId));
  const aliquotas = await aliquotasDifal(sb);
  return calcularDifal({
    valorOperacao: args.valorOperacao,
    ufDestino: fiscais.uf,
    inscricaoEstadual: fiscais.inscricaoEstadual,
    ieIsento: fiscais.ieIsento,
    aliquotas: aliquotas as never,
  });
}
