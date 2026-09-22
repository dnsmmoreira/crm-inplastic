import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { solicitarRecuperacaoSenha } from "@/lib/invites.functions";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (search: Record<string, unknown>) => ({
    recuperar: search.recuperar === true || search.recuperar === "true" ? true : undefined,
    next: typeof search.next === "string" ? search.next : undefined,
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { recuperar, next } = Route.useSearch();
  const [modo, setModo] = useState<"login" | "recuperar">(recuperar ? "recuperar" : "login");

  useEffect(() => {
    if (recuperar) setModo("recuperar");
  }, [recuperar]);

  useEffect(() => {
    if (!loading && user && pathname === "/auth") {
      // Só destinos internos: nunca navegar para endereço externo vindo da URL.
      const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      void navigate({ to: destino });
    }
  }, [user, loading, pathname, next, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold">INPLASTIC - CRM</h1>
            <p className="text-sm text-white/60">
              {modo === "login" ? "Entre com sua conta corporativa" : "Recuperação de senha"}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-card p-6 shadow-xl">
          {modo === "login" ? (
            <>
              <SignInForm onSubmit={signIn} />
              <button
                type="button"
                className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setModo("recuperar")}
              >
                Esqueci minha senha
              </button>
            </>
          ) : (
            <RecuperarForm onVoltar={() => setModo("login")} />
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-4">
          Novo por aqui? Peça um convite ao administrador do CRM.
        </p>
      </div>
    </div>
  );
}

function SignInForm({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<{ error: string | null }> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await onSubmit(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Bem-vindo!");
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="space-y-1">
        <Label htmlFor="s-email">E-mail</Label>
        <Input id="s-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-pw">Senha</Label>
        <Input id="s-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

/**
 * Painel "Esqueci minha senha". A resposta é SEMPRE a mesma, exista o e-mail
 * ou não — inclusive quando o limite de tentativas é atingido.
 */
export const MSG_RECUPERACAO =
  "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.";

function RecuperarForm({ onVoltar }: { onVoltar: () => void }) {
  const solicitar = useServerFn(solicitarRecuperacaoSenha);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await solicitar({ data: { email } });
    } catch {
      // Silencioso de propósito: nenhum erro pode revelar se o e-mail existe.
    } finally {
      setBusy(false);
      setEnviado(true);
    }
  };

  if (enviado) {
    return (
      <div className="space-y-4 text-sm">
        <p>{MSG_RECUPERACAO}</p>
        <p className="text-xs text-muted-foreground">
          O link vale uma única vez e por pouco tempo. Confira também a caixa de spam.
        </p>
        <Button variant="outline" className="w-full gap-1" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
      </p>
      <div className="space-y-1">
        <Label htmlFor="r-email">E-mail</Label>
        <Input
          id="r-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Enviar link
      </Button>
      <Button type="button" variant="ghost" className="w-full gap-1" onClick={onVoltar}>
        <ArrowLeft className="h-4 w-4" /> Voltar para o login
      </Button>
    </form>
  );
}
