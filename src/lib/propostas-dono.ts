/**
 * Opções de "Proposta em nome de": pessoas ativas (não excluídas), em ordem
 * alfabética, com quem está criando marcado como padrão.
 */
export type PerfilDonoProposta = {
  id: string;
  name: string | null;
  ativo: boolean | null;
  deleted_at: string | null;
};

export type OpcoesDonoProposta = {
  opcoes: { id: string; nome: string }[];
  padrao: string;
};

export function opcoesDonoProposta(
  perfis: readonly PerfilDonoProposta[],
  criadorId: string,
): OpcoesDonoProposta {
  const opcoes = perfis
    .filter((p) => p.ativo === true && !p.deleted_at)
    .map((p) => ({ id: p.id, nome: (p.name ?? "").trim() || "Sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { opcoes, padrao: criadorId };
}
