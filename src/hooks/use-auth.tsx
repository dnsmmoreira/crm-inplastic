import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User as SupaUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { hydrateCrmForUser, clearCrmState } from "@/lib/crm-sync";


export type AppRole = "admin" | "vendedor";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  role: AppRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AVATAR_COLORS = ["#0f766e", "#2563eb", "#db2777", "#ea580c", "#7c3aed", "#0891b2"];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

async function loadAuthUser(supaUser: SupaUser): Promise<AuthUser> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("name, avatar_color").eq("id", supaUser.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", supaUser.id),
  ]);
  const role: AppRole = (roles ?? []).some((r) => r.role === "admin") ? "admin" : "vendedor";
  const name = profile?.name || (supaUser.user_metadata?.name as string | undefined) || supaUser.email?.split("@")[0] || "Usuário";
  const avatarColor = profile?.avatar_color || colorFor(supaUser.id);
  return { id: supaUser.id, email: supaUser.email ?? "", name, avatarColor, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (nextSession: Session | null, opts?: { clearOnEmpty?: boolean }) => {
    setSession(nextSession);
    if (nextSession?.user) {
      try {
        const u = await loadAuthUser(nextSession.user);
        setUser(u);
        try {
          await hydrateCrmForUser(u.id, u.role);
        } catch (err) {
          console.error("hydrateCrmForUser failed", err);
        }
      } catch (e) {
        console.error("loadAuthUser failed", e);
        // Não zera o user aqui — se já tinha um user carregado, mantém.
        // Uma falha transitória em profiles/user_roles não deve deslogar.
      }
    } else if (opts?.clearOnEmpty) {
      setUser(null);
      clearCrmState();
    }
    setLoading(false);
  }, []);


  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // SIGNED_OUT é o único caso em que limpamos o usuário.
      if (event === "SIGNED_OUT") {
        setTimeout(() => { void hydrate(null, { clearOnEmpty: true }); }, 0);
        return;
      }
      // Só (re)hidrata quando temos sessão real. Ignora INITIAL_SESSION vazio,
      // TOKEN_REFRESHED vazio, etc., pra não redirecionar durante navegação.
      if (!s) return;
      if (event === "TOKEN_REFRESHED") {
        setSession(s);
        return;
      }
      setTimeout(() => { void hydrate(s); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      // Na primeira montagem, se não houver sessão, aí sim limpamos (sem redirect infinito).
      void hydrate(data.session, { clearOnEmpty: true });
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [hydrate]);



  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session);
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { name },
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signIn, signUp, signOut, refresh }),
    [user, session, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
