import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { avaliarSenha } from "@/components/usuarios/DefinirSenhaDialog";

export const Route = createFileRoute("/definir-senha")({
  component: DefinirSenhaPage,
  head: () => ({
    meta: [
      { title: "Definir senha — INPLASTIC - CRM" },
      { name: "description", content: "Defina sua senha de acesso ao CRM usando o link do convite." },
      { property: "og:title", content: "Definir senha — INPLASTIC - CRM" },
      { property: "og:description", content: "Defina sua senha de acesso ao CRM usando o link do convite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/**
 * Página de convite/recuperação. O token do e-mail (PKCE) é trocado pelo SDK
 * por uma sessão; aqui só é possível alterar a senha do PRÓPRIO usuário
 * autenticado por esse token. Sem sessão válida, nada pode ser alterado.
 */
function DefinirSenhaPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"verificando" | "pronto" | "invalido">("verificando");
  const [senha, setSenha] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const forca = useMemo(() => avaliarSenha(senha), [senha]);
  const iguais = senha.length > 0 && senha === confirm;

  useEffect(() => {
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (vivo && session) setEstado("pronto");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setEstado(data.session ? "pronto" : "invalido");
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forca.ok) { toast.error(`Senha fraca: ${forca.problemas.join(", ")}.`); return; }
    if (!iguais) { toast.error("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw new Error("Link inválido ou expirado. Peça um novo convite.");
      toast.success("Senha definida! Faça login para continuar.");
      await supabase.auth.signOut();
      void navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao definir a senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold">Definir senha</h1>
            <p className="text-sm text-white/60">Use o link enviado para o seu e-mail.</p>
          </div>
        </div>

        {estado === "verificando" && (
          <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Validando link…
          </div>
        )}

        {estado === "invalido" && (
          <div className="rounded-xl bg-card p-6 space-y-3 text-sm">
            <p>Link inválido, já utilizado ou expirado.</p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Ir para o login
            </Button>
          </div>
        )}

        {estado === "pronto" && (
          <form className="rounded-xl bg-card p-6 shadow-xl space-y-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="ds-nova">Nova senha</Label>
              <Input id="ds-nova" type="password" value={senha} maxLength={72}
                autoComplete="new-password" onChange={(e) => setSenha(e.target.value)} />
              <p className={`text-xs ${forca.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
                {forca.ok ? "Senha válida." : `Requer ${forca.problemas.join(", ")}.`}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ds-conf">Confirmar senha</Label>
              <Input id="ds-conf" type="password" value={confirm} maxLength={72}
                autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
              {confirm.length > 0 && !iguais && (
                <p className="text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy || !forca.ok || !iguais}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
