/**
 * Registro de INTENÇÃO de exclusão (fora do estado persistido).
 *
 * O sync só apaga no banco ids que o usuário pediu explicitamente para excluir.
 * Ids que somem do estado local sem intenção registrada são ignorados (nunca apagados).
 */
export type DeleteCollection =
  | "leads"
  | "tasks"
  | "products"
  | "emitters"
  | "paymentTerms"
  | "proposals"
  | "proposalItems"
  | "proposalParcelas";

const intents = new Map<DeleteCollection, Set<string>>();

function bucket(collection: DeleteCollection): Set<string> {
  let s = intents.get(collection);
  if (!s) {
    s = new Set<string>();
    intents.set(collection, s);
  }
  return s;
}

export function markDeleted(collection: DeleteCollection, ...ids: Array<string | undefined | null>) {
  const s = bucket(collection);
  ids.forEach((id) => {
    if (id) s.add(id);
  });
}

export function isIntentionalDelete(collection: DeleteCollection) {
  return (id: string) => bucket(collection).has(id);
}

export function clearDeleteIntent(collection: DeleteCollection, ids: string[]) {
  const s = bucket(collection);
  ids.forEach((id) => s.delete(id));
}
