/**
 * Regras puras do escopo por equipe (Supervisor ADM).
 *
 * O bloqueio real é RLS (`tem_permissao` + `mesma_equipe` + `supervisor_ve_tudo`).
 * Estas funções só espelham a mesma regra para a UI.
 */

export const PERM_LEADS_VER_EQUIPE = "leads.ver_equipe";
export const PERM_CLIENTES_VER_EQUIPE = "clientes.ver_equipe";
export const PERM_PROPOSTAS_VER_EQUIPE = "propostas.ver_equipe";
export const PERM_PEDIDOS_VER_EQUIPE = "pedidos.ver_equipe";

export const PERMS_VER_EQUIPE = [
  PERM_LEADS_VER_EQUIPE,
  PERM_CLIENTES_VER_EQUIPE,
  PERM_PROPOSTAS_VER_EQUIPE,
  PERM_PEDIDOS_VER_EQUIPE,
] as const;

export type SupervisorEscopo = "equipe" | "global";

export function normalizarSupervisorEscopo(valor: unknown): SupervisorEscopo {
  return valor === "global" ? "global" : "equipe";
}

/**
 * Um perfil é "supervisor por equipe" quando carrega ao menos uma das chaves
 * `*.ver_equipe`. Nunca deduza pelo NOME do perfil — ele é renomeável.
 */
export function perfilEhSupervisorEquipe(chaves: readonly string[] | null | undefined): boolean {
  if (!chaves) return false;
  return PERMS_VER_EQUIPE.some((c) => chaves.includes(c));
}

/** Espelho da policy: mesma equipe só casa quando as DUAS equipes existem. */
export function mesmaEquipe(
  equipeA: string | null | undefined,
  equipeB: string | null | undefined,
): boolean {
  if (!equipeA || !equipeB) return false;
  return equipeA === equipeB;
}

/** Espelho exato do `using` das policies novas de SELECT. */
export function visivelPorEquipe(params: {
  temPermissaoVerEquipe: boolean;
  escopo: SupervisorEscopo;
  equipeAtor: string | null | undefined;
  equipeDono: string | null | undefined;
}): boolean {
  if (!params.temPermissaoVerEquipe) return false;
  if (params.escopo === "global") return true;
  return mesmaEquipe(params.equipeAtor, params.equipeDono);
}
