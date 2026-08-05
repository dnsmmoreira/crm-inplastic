import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * Sino com a contagem de notificações não lidas do usuário logado,
 * atualizado em tempo real via Realtime.
 */
export function NotificacoesBell({ className }: { className?: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const { count: c, error } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("lida_em", null);
    if (error) {
      console.error(error);
      return;
    }
    setCount(c ?? 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    void load();
    const channel = supabase
      .channel(`notificacoes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  if (!userId) return null;

  return (
    <Link
      to="/atendimento-ia"
      aria-label={`Notificações${count > 0 ? `: ${count} não lidas` : ""}`}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
