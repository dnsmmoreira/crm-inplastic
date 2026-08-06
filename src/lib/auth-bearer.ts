import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Middleware de cliente que anexa o token Supabase às chamadas de server function.
 *
 * Por que não usar o `attachSupabaseAuth` gerado: ele chama
 * `supabase.auth.getSession()` a cada chamada de server function. Em rajadas
 * (abrir um select, carregar diálogos, várias chamadas simultâneas) isso pode
 * disparar refreshes concorrentes do token; quando um refresh falha porque o
 * refresh token já foi consumido por outra chamada, o SDK emite `SIGNED_OUT`
 * e o usuário é jogado de volta pra tela de login. Além disso, uma resposta
 * momentaneamente vazia gera "Unauthorized: No authorization header provided".
 *
 * Aqui mantemos o token em cache na memória, atualizado pelo
 * `onAuthStateChange`, e só consultamos o SDK quando não temos nada em cache
 * (ou quando o cache já expirou), desduplicando chamadas concorrentes.
 */

let cachedToken: string | null = null;
let cachedExp = 0;
let inflight: Promise<string | null> | null = null;

function decodeExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload?.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function setToken(token: string | null) {
  cachedToken = token;
  cachedExp = token ? decodeExp(token) : 0;
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      setToken(null);
      return;
    }
    if (session?.access_token) setToken(session.access_token);
  });
}

async function resolveToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  // Margem de 60s: deixamos o SDK renovar antes de o token vencer de fato.
  if (cachedToken && cachedExp - 60 > now) return cachedToken;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      // Não apagamos um token válido em cache por causa de uma leitura vazia
      // transitória — só substituímos quando temos um token novo.
      if (token) setToken(token);
      return token ?? cachedToken;
    } catch {
      return cachedToken;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const attachAuthBearer = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = typeof window === "undefined" ? null : await resolveToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
