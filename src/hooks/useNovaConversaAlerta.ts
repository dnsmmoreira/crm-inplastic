import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ConversaAlerta = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];

/** Beep curto via Web Audio API. Silencioso se o browser bloquear o autoplay. */
export function tocarBeep(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    // dois "bipes" curtos
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1174, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1200);
  } catch {
    /* autoplay bloqueado — segue só com o alerta visual */
  }
}

/**
 * Escuta em tempo real as conversas atribuídas ao usuário informado e
 * devolve a conversa que acabou de cair no colo dele.
 *
 * Parametrizado por userId — sem hardcode de vendedor ou de página.
 */
export function useNovaConversaAlerta(userId: string | null) {
  const [conversa, setConversa] = useState<ConversaAlerta | null>(null);
  const vistas = useRef<Set<string>>(new Set());

  const dispensar = useCallback(() => setConversa(null), []);

  useEffect(() => {
    if (!userId) {
      setConversa(null);
      return;
    }
    vistas.current = new Set();

    const handle = (row: ConversaAlerta | null) => {
      if (!row || row.atribuido_para !== userId) return;
      if (vistas.current.has(row.id)) return;
      vistas.current.add(row.id);
      setConversa(row);
      tocarBeep();
    };

    const channel = supabase
      .channel(`nova-conversa-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_conversas",
          filter: `atribuido_para=eq.${userId}`,
        },
        (payload) => handle(payload.new as ConversaAlerta),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_conversas",
          filter: `atribuido_para=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as ConversaAlerta;
          const prev = payload.old as Partial<ConversaAlerta> | null;
          // só alerta quando a conversa PASSOU a apontar para este usuário
          if (prev && prev.atribuido_para === next.atribuido_para) return;
          handle(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { conversa, dispensar };
}
