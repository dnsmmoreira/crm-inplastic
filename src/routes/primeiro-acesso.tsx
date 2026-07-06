import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Boxes, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setFirstAccessPassword } from "@/lib/invites.functions";

export const Route = createFileRoute("/primeiro-acesso")({
  component: PrimeiroAcessoPage,
  head: () => ({
    meta: [{ title: "Primeiro acesso — INPLASTIC - CRM" }],
  }),
});

function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const setPassword = useServerFn(setFirstAccessPassword);
  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha precisa ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setBusy(true);
    try {
      await setPassword({ data: { email: email.trim(), password } });
      setDone(true);
      toast.success("Senha definida com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao definir senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold">INPLASTIC - CRM</h1>
            <p className="text-sm text-white/60">Primeiro acesso — defina sua senha</p>
          </div>
        </div>

        <div className="rounded-xl bg-card p-6 shadow-xl">
          {done ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 text-emerald-600 font-medium">
                <KeyRound className="h-4 w-4" /> Senha criada com sucesso
              </div>
              <p className="text-muted-foreground">
                Agora você já pode entrar no CRM com o e-mail <strong>{email}</strong> e a senha
                que acabou de definir.
              </p>
              <Button className="w-full" onClick={() => void navigate({ to: "/auth" })}>
                Ir para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Digite o e-mail que o administrador cadastrou e crie sua senha.
                Isto só funciona uma vez — depois use "Esqueci minha senha" na tela de login.
              </p>
              <div className="space-y-1">
                <Label htmlFor="pa-email">E-mail</Label>
                <Input
                  id="pa-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pa-pw">Nova senha</Label>
                <Input
                  id="pa-pw"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pa-pw2">Confirmar senha</Label>
                <Input
                  id="pa-pw2"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar senha e ativar acesso
              </Button>
              <div className="text-center text-xs text-muted-foreground pt-1">
                <Link to="/auth" className="hover:underline">Já tenho acesso — voltar ao login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
