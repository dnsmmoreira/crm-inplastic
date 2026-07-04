import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && user && pathname === "/auth") {
      void navigate({ to: "/" });
    }
  }, [user, loading, pathname, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold">INPLASTIC - CRM</h1>
            <p className="text-sm text-white/60">Entre com sua conta corporativa</p>
          </div>
        </div>

        <div className="rounded-xl bg-card p-6 shadow-xl">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm onSubmit={signIn} />
            </TabsContent>
            <TabsContent value="signup">
              <SignUpForm onSubmit={signUp} />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-white/40 mt-4">
          Primeiro usuário cadastrado se torna administrador.
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

function SignUpForm({ onSubmit }: { onSubmit: (email: string, password: string, name: string) => Promise<{ error: string | null }> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Senha precisa de pelo menos 6 caracteres"); return; }
    setBusy(true);
    const { error } = await onSubmit(email, password, name);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Conta criada. Você já está logado.");
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="space-y-1">
        <Label htmlFor="u-name">Nome completo</Label>
        <Input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-email">E-mail</Label>
        <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-pw">Senha</Label>
        <Input id="u-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Criar conta
      </Button>
    </form>
  );
}
