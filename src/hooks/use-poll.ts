import { useEffect, useRef } from "react";

/**
 * Polling consciente da visibilidade da aba.
 *
 * - Pausa completamente enquanto `document.hidden` (aba em segundo plano).
 * - Ao voltar o foco, dispara uma execução imediata e retoma o intervalo.
 * - `intervalMs` pode variar (ex.: intervalo maior quando não há conversa aberta).
 * - `enabled=false` desliga o polling sem desmontar o componente.
 */
export function usePoll(fn: () => void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      stop();
      timer = setInterval(() => fnRef.current(), intervalMs);
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stop();
      } else {
        fnRef.current();
        start();
      }
    };

    if (typeof document !== "undefined" && document.hidden) {
      // aba em segundo plano: nada de polling até voltar o foco
    } else {
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
