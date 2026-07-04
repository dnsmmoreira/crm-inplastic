import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/aceitar-convite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // O link do convite chega com tokens no hash da URL. O supabase-js
    // consome esse hash automaticamente e cria a sessão. Aguardamos um
    // ciclo para garantir e então checamos.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.user) {
        setEmail(data.session.user.email ?? "");
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    };

    // Pequeno delay para o cliente processar o hash da URL
    const t = setTimeout(check, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Senha precisa de pelo menos 6 caracteres"); return; }
    if (password !== confirm) { toast.error("As senhas não coincidem"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha definida! Bem-vindo.");
    void navigate({ to: "/" });
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
            <p className="text-sm text-white/60">Aceite seu convite e defina uma senha</p>
          </div>
        </div>

        <div className="rounded-xl bg-card p-6 shadow-xl">
          {status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando convite…
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-3 text-sm">
              <p className="font-medium text-destructive">Convite inválido ou expirado.</p>
              <p className="text-muted-foreground">Peça ao administrador para enviar um novo convite.</p>
              <Button variant="outline" className="w-full" onClick={() => void navigate({ to: "/auth" })}>
                Ir para o login
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={email} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw">Nova senha</Label>
                <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw2">Confirmar senha</Label>
                <Input id="pw2" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Ativar conta
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
