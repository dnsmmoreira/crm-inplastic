import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirSenhaUsuario } from "@/lib/usuarios.functions";

export function avaliarSenha(pw: string) {
  const problemas: string[] = [];
  if (pw.length < 8) problemas.push("mínimo de 8 caracteres");
  if (!/[A-Za-z]/.test(pw)) problemas.push("pelo menos uma letra");
  if (!/[0-9]/.test(pw)) problemas.push("pelo menos um número");
  return { ok: problemas.length === 0, problemas };
}

export function DefinirSenhaDialog({
  usuario,
  open,
  onOpenChange,
  onDone,
}: {
  usuario: { id: string; name: string; email: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => Promise<void> | void;
}) {
  const definir = useServerFn(definirSenhaUsuario);
  const [senha, setSenha] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setSenha(""); setConfirm(""); }
  }, [open, usuario?.id]);

  const forca = useMemo(() => avaliarSenha(senha), [senha]);
  const iguais = senha.length > 0 && senha === confirm;

  if (!usuario) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forca.ok) { toast.error(`Senha fraca: ${forca.problemas.join(", ")}.`); return; }
    if (!iguais) { toast.error("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      await definir({ data: { userId: usuario.id, password: senha } });
      toast.success("Senha provisória definida", {
        description: "O usuário terá que trocar a senha no próximo login.",
      });
      await onDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao definir senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Definir senha
          </DialogTitle>
          <DialogDescription>
            {usuario.name} · {usuario.email} — a senha é provisória e a troca será exigida no próximo login.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="ds-senha">Senha provisória</Label>
            <Input
              id="ds-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              maxLength={72}
            />
            <p className={`text-xs ${forca.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
              {forca.ok ? "Senha válida." : `Requer ${forca.problemas.join(", ")}.`}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ds-confirm">Confirmar senha</Label>
            <Input
              id="ds-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={72}
              aria-invalid={confirm.length > 0 && !iguais}
            />
            {confirm.length > 0 && !iguais && (
              <p className="text-xs text-destructive">As senhas não coincidem.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !forca.ok || !iguais} className="gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
