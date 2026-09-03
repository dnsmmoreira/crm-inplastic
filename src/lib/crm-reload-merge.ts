/**
 * Recarga de coleção (evento realtime) NÃO pode apagar alteração local ainda
 * não gravada.
 *
 * Cenário real do incidente: o usuário adiciona itens na proposta; o debounce
 * de 500 ms do save ainda está pendente; chega um evento realtime de
 * `proposta_itens`/`proposta_parcelas` (inclusive gerado pelo próprio save
 * anterior) e a recarga substitui `state.proposals` inteiro pela versão do
 * banco — os itens recém-adicionados somem da tela e nunca são gravados.
 *
 * Regra: registro com alteração local pendente (JSON local ≠ snapshot do
 * dirty-tracking, ou id inexistente no snapshot) prevalece sobre o remoto.
 */
export function mesclarPreservandoPendentes<T extends { id: string }>(
  remotos: T[],
  locais: T[],
  estaPendente: (item: T) => boolean,
): T[] {
  const pendentes = new Map<string, T>();
  for (const l of locais) if (estaPendente(l)) pendentes.set(l.id, l);
  if (pendentes.size === 0) return remotos;

  const out = remotos.map((r) => {
    const local = pendentes.get(r.id);
    if (!local) return r;
    pendentes.delete(r.id);
    return local;
  });
  // Sobraram os criados localmente que o banco ainda não conhece.
  return [...pendentes.values(), ...out];
}
