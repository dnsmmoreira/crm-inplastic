/**
 * Helpers puros do drag-and-drop do Funil de Vendas.
 *
 * O quadro rola na horizontal (`overflow-auto`). Com a detecção de colisão
 * padrão do dnd-kit as medições ficam defasadas durante o auto-scroll e o
 * `over` pode resolver para uma coluna vizinha. Estas funções garantem que
 * só um id de coluna conhecido seja aceito como alvo.
 */

/** Só aceita ids que sejam colunas presentes no quadro. */
export function resolverColunaAlvo<T extends string>(
  overId: string | number | null | undefined,
  colunasValidas: readonly T[],
): T | null {
  if (overId === null || overId === undefined) return null;
  const id = String(overId);
  return (colunasValidas as readonly string[]).includes(id) ? (id as T) : null;
}

/** Identifica o card arrastado: proposta (`prop:<id>`) ou lead. */
export function identificarCard(activeId: string | number): 
  | { tipo: "proposta"; id: string }
  | { tipo: "lead"; id: string } {
  const raw = String(activeId);
  return raw.startsWith("prop:")
    ? { tipo: "proposta", id: raw.slice(5) }
    : { tipo: "lead", id: raw };
}
