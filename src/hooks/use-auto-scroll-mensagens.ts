import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 120;

/**
 * Auto-scroll genérico para threads de mensagens.
 * Rola ao fim SOMENTE quando o usuário já está perto do fim ou quando a thread muda.
 * Se o usuário está lendo o histórico, o scroll nunca é tocado.
 */
export function useAutoScrollMensagens<T extends HTMLElement = HTMLDivElement>(
  ref: React.RefObject<T | null>,
  conversaKey: string | null,
  itens: ReadonlyArray<{ id: string }>,
) {
  const [temNovas, setTemNovas] = useState(false);
  const ultimoIdRef = useRef<string | null>(null);
  const conversaRef = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    const ultima = itens.length > 0 ? itens[itens.length - 1]!.id : null;
    const trocouConversa = conversaRef.current !== conversaKey;
    const chegouNova = !trocouConversa && ultima !== null && ultima !== ultimoIdRef.current;
    conversaRef.current = conversaKey;
    ultimoIdRef.current = ultima;
    if (!el) return;

    if (trocouConversa) {
      el.scrollTop = el.scrollHeight;
      setTemNovas(false);
      return;
    }
    if (!chegouNova) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
      setTemNovas(false);
    } else {
      setTemNovas(true);
    }
  }, [ref, conversaKey, itens]);

  const onScroll = useCallback((e: React.UIEvent<T>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) setTemNovas(false);
  }, []);

  const scrollParaFim = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    setTemNovas(false);
  }, [ref]);

  return { temNovas, onScroll, scrollParaFim };
}
