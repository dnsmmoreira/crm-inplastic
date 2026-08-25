import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { concluirTrocaSenha } from "@/lib/usuarios.functions";
import { avaliarSenha } from "@/components/usuarios/DefinirSenhaDialog";

export const Route = createFileRoute("/trocar-senha")({
  component: TrocarSenhaPage,
  head: () => ({
    meta: [
      { title: "Trocar senha — INPLASTIC - CRM" },
      { name: "description", content: "Defina uma nova senha para continuar usando o CRM." },
      { property: "og:title", content: "Trocar senha — INPLASTIC - CRM" },
      { property: "og:description", content: "Defina uma nova senha para continuar usando o CRM." },
    ],
  }),
});

function TrocarSenhaPage() {
  const { refresh, signOut } = useAuth();
  const concluir = useServerFn(concluirTrocaSenha);
  const [atual, setAtual] = useState("");
  const [senha, setSenha] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const forca = useMemo(() => avaliarSenha(senha), [senha]);
  const iguais = senha.length > 0 && senha === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atual.trim()) { toast.error("Informe a senha atual."); return; }
    if (!forca.ok) { toast.error(`Senha fraca: ${forca.problemas.join(", ")}.`); return; }
    if (!iguais) { toast.error("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      await concluir({ data: { senhaAtual: atual, password: senha } });
      await refresh();
      toast.success("Senha atualizada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao trocar a senha");
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
            <h1 className="font-display text-xl font-semibold">Troque sua senha</h1>
            <p className="text-sm text-white/60">
              Um administrador definiu uma senha provisória. Crie uma nova senha para continuar.
            </p>
          </div>
        </div>

        <form className="rounded-xl bg-card p-6 shadow-xl space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="ts-atual">Senha atual</Label>

            <Input id="ts-atual" type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ts-nova">Nova senha</Label>
            <Input id="ts-nova" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" maxLength={72} />
            <p className={`text-xs ${forca.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
              {forca.ok ? "Senha válida." : `Requer ${forca.problemas.join(", ")}.`}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ts-conf">Confirmar nova senha</Label>
            <Input id="ts-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={72} />
            {confirm.length > 0 && !iguais && <p className="text-xs text-destructive">As senhas não coincidem.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={busy || !atual.trim() || !forca.ok || !iguais}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar nova senha
          </Button>
          <Button type="button" variant="ghost" className="w-full gap-1" onClick={() => { void signOut(); }}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </form>
      </div>
    </div>
  );
}
