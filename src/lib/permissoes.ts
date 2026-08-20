/**
 * Regras puras de permissão compartilhadas entre UI e servidor.
 * A UI usa para esconder/desabilitar; o servidor usa como referência das mesmas
 * regras (o bloqueio real acontece nos guards das server functions e no RLS).
 */

export const PERM_PEDIDOS_MOVIMENTAR = "pedidos.movimentar";
export const PERM_PEDIDOS_EXCLUIR = "pedidos.excluir";
export const PERM_EMPRESAS_EDITAR = "empresas.editar";
export const PERM_PEDIDOS_VER_TODOS = "pedidos.ver_todos";

/** Status de conversa em que a escrita manual é permitida. */
export const STATUS_CONVERSA_ESCRITA = ["aguardando_humano", "humano_atendendo"] as const;

export function podeEscreverConversa(status: string | null | undefined): boolean {
  if (!status) return false;
  return (STATUS_CONVERSA_ESCRITA as readonly string[]).includes(status);
}

export type Ator = { isAdmin: boolean; permKeys: readonly string[] };

/**
 * Semântica única de permissão granular, espelhando a função SQL `tem_permissao`:
 * - com perfil ativo vinculado, a decisão sai EXCLUSIVAMENTE das chaves do perfil
 *   (o papel admin não concede nada extra);
 * - sem perfil vinculado, o papel admin libera tudo (rede de bootstrap).
 */
export function resolvePermissao(
  ator: { isAdmin: boolean; temPerfilAtivo: boolean; permKeys: readonly string[] },
  chave: string,
): boolean {
  if (ator.temPerfilAtivo) return ator.permKeys.includes(chave);
  return ator.isAdmin;
}

function tem(ator: Ator, chave: string): boolean {
  return ator.isAdmin || ator.permKeys.includes(chave);
}

export function podeMovimentarPedido(ator: Ator): boolean {
  return tem(ator, PERM_PEDIDOS_MOVIMENTAR);
}

export function podeExcluirPedido(ator: Ator): boolean {
  return tem(ator, PERM_PEDIDOS_EXCLUIR);
}

export function podeEditarEmpresa(ator: Ator): boolean {
  return tem(ator, PERM_EMPRESAS_EDITAR);
}

/** Vendedor comum (sem visão global de pedidos) só enxerga os próprios no relatório. */
export function relatorioEscopoProprio(ator: Ator): boolean {
  return !tem(ator, PERM_PEDIDOS_VER_TODOS);
}
