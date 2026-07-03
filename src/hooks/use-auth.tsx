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

  const hydrate = useCallback(async (nextSession: Session | null) => {
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
        setUser(null);
      }
    } else {
      setUser(null);
      clearCrmState();
    }
    setLoading(false);
  }, []);


  useEffect(() => {
    let initialized = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignora eventos ruidosos que não representam mudança real de identidade,
      // pra não limpar o user por causa de INITIAL_SESSION/TOKEN_REFRESHED sem sessão.
      if (event === "TOKEN_REFRESHED" && s) {
        setSession(s);
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      setTimeout(() => { void hydrate(s); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      initialized = true;
      void hydrate(data.session);
    });
    return () => { sub.subscription.unsubscribe(); void initialized; };
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
