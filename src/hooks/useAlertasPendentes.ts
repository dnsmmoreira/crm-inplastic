import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aceitarAlerta, adiarAlerta } from "@/lib/alertas.functions";

export type AlertaPendenteRow = {
  id: string;
  tipo: string;
  titulo: string | null;
  created_at: string;
  pedido_id: string | null;
  conversa_id: string | null;
  exige_aceite: boolean;
  aceito_em: string | null;
  adiado_ate: string | null;
};

/**
 * Regra única da fila: exige aceite, ainda não aceito e não adiado para o futuro.
 * Exportada pura para poder ser testada sem banco.
 */
export function filtrarPendentes(
  rows: AlertaPendenteRow[],
  agora: Date = new Date(),
): AlertaPendenteRow[] {
  return rows
    .filter(
      (r) =>
        r.exige_aceite === true &&
        r.aceito_em == null &&
        (r.adiado_ate == null || new Date(r.adiado_ate).getTime() <= agora.getTime()),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const COLUNAS =
  "id, tipo, titulo, created_at, pedido_id, conversa_id, exige_aceite, aceito_em, adiado_ate";

/**
 * Alertas que EXIGEM aceite do usuário logado.
 *
 * Três caminhos, de propósito redundantes, para que nenhum aviso se perca:
 *  1. consulta ao montar (recupera o que chegou com a aba fechada);
 *  2. Realtime em `notificacoes` (chegada imediata);
 *  3. reavaliação a cada 60s (faz voltar o que foi adiado).
 */
export function useAlertasPendentes(userId: string | null) {
  const [todos, setTodos] = useState<AlertaPendenteRow[]>([]);
  const [pendentes, setPendentes] = useState<AlertaPendenteRow[]>([]);
  const jaBipou = useRef<Set<string>>(new Set());
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!userId) {
      setTodos([]);
      return;
    }
    const { data } = await supabase
      .from("notificacoes")
      .select(COLUNAS)
      .eq("user_id", userId)
      .eq("exige_aceite", true)
      .is("aceito_em", null)
      .order("created_at", { ascending: true });
    setTodos((data ?? []) as AlertaPendenteRow[]);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setTodos([]);
      setPendentes([]);
      return;
    }
    jaBipou.current = new Set();
    void carregar();

    const channel = supabase
      .channel(`alertas-pendentes-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${userId}`,
        },
        () => void carregar(),
      )
      .subscribe();

    const timer = window.setInterval(() => {
      // Reavalia a fila (alertas adiados que venceram) e ressincroniza com o banco.
      setTodos((atual) => [...atual]);
      void carregar();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, carregar]);

  // Deriva a fila visível a partir do estado bruto (aplica `adiado_ate`).
  useEffect(() => {
    setPendentes(filtrarPendentes(todos));
  }, [todos]);

  const atual = pendentes[0] ?? null;

  const aceitar = useCallback(
    async (id: string) => {
      setProcessando(true);
      try {
        await aceitarAlerta({ data: { notificacao_id: id } });
        setTodos((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, aceito_em: new Date().toISOString() } : r,
          ),
        );
      } finally {
        setProcessando(false);
      }
    },
    [],
  );

  const adiar = useCallback(async (id: string) => {
    setProcessando(true);
    try {
      const r = await adiarAlerta({ data: { notificacao_id: id, minutos: 10 } });
      setTodos((prev) =>
        prev.map((x) => (x.id === id ? { ...x, adiado_ate: r.adiado_ate } : x)),
      );
    } finally {
      setProcessando(false);
    }
  }, []);

  return { atual, pendentes, aceitar, adiar, processando, jaBipou, recarregar: carregar };
}
