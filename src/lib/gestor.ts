/**
 * Regra pura: quem recebe as notificações de um registro cujo dono é um
 * representante.
 *
 * O dono continua sendo o destinatário principal (alerta acionável). O gestor
 * responsável, quando existir, recebe APENAS uma cópia informativa — nunca um
 * alerta que exija aceite, e nunca vira dono da tarefa.
 *
 * Não concede permissão nenhuma: é só roteamento de aviso.
 */

export type PerfilGestor = { id: string; gestorId?: string | null };

/**
 * `[owner, gestor]` sem nulos e sem repetidos, preservando a ordem
 * (o dono sempre primeiro).
 */
export function destinatariosComGestor(
  ownerId: string | null | undefined,
  perfis: readonly PerfilGestor[],
): string[] {
  if (!ownerId) return [];
  const perfil = perfis.find((p) => p.id === ownerId);
  const gestor = perfil?.gestorId ?? null;
  const saida = [ownerId];
  if (gestor && gestor !== ownerId) saida.push(gestor);
  return saida;
}

/** Só o gestor (cópia informativa), quando houver e for diferente do dono. */
export function gestorDe(
  ownerId: string | null | undefined,
  perfis: readonly PerfilGestor[],
): string | null {
  const [, gestor] = destinatariosComGestor(ownerId, perfis);
  return gestor ?? null;
}
