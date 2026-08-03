import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

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
import { softDeleteUsuario, hardDeleteUsuario, type UsuarioRow } from "@/lib/usuarios.functions";

export function ExcluirUsuarioDialog({
  usuario,
  candidatos,
  open,
  onOpenChange,
  onDone,
}: {
  usuario: UsuarioRow | null;
  candidatos: UsuarioRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => Promise<void> | void;
}) {
  const soft = useServerFn(softDeleteUsuario);
  const hard = useServerFn(hardDeleteUsuario);
  const [modo, setModo] = useState<"soft" | "hard">("soft");
  const [nome, setNome] = useState("");
  const [destino, setDestino] = useState("");
  const [busy, setBusy] = useState(false);

  if (!usuario) return null;

  const outros = candidatos.filter((c) => c.id !== usuario.id && !c.deletedAt);

  const confirmar = async () => {
    setBusy(true);
    try {
      if (modo === "soft") {
        await soft({ data: { userId: usuario.id } });
        toast.success("Usuário desativado e removido da fila (histórico preservado)");
      } else {
        if (!destino) { toast.error("Escolha quem recebe os leads e propostas."); setBusy(false); return; }
        const res = await hard({
          data: { userId: usuario.id, confirmacaoNome: nome, reatribuirParaUserId: destino },
        });
        const total = Object.values(res.resumo).reduce((a, b) => a + b, 0);
        toast.success("Usuário excluído definitivamente", {
          description: `${total} registro(s) reatribuído(s).`,
        });
      }
      setNome("");
      setDestino("");
      setModo("soft");
      await onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setBusy(false);
    }
  };

  const nomeConfere = nome.trim().toLowerCase() === usuario.name.trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Excluir {usuario.name}
          </DialogTitle>
          <DialogDescription>
            A exclusão padrão é lógica: o acesso é bloqueado e todo o histórico permanece intacto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex gap-3 rounded-lg border p-3 cursor-pointer">
            <input type="radio" checked={modo === "soft"} onChange={() => setModo("soft")} className="mt-1" />
            <div>
              <div className="text-sm font-medium">Exclusão lógica (recomendada)</div>
              <p className="text-xs text-muted-foreground">
                Desativa a conta, encerra as sessões e tira o vendedor da fila. Leads e propostas continuam com ele.
              </p>
            </div>
          </label>

          <label className="flex gap-3 rounded-lg border p-3 cursor-pointer">
            <input type="radio" checked={modo === "hard"} onChange={() => setModo("hard")} className="mt-1" />
            <div>
              <div className="text-sm font-medium text-destructive">Exclusão definitiva</div>
              <p className="text-xs text-muted-foreground">
                Apaga a conta de acesso. Exige reatribuir os registros e digitar o nome exato.
              </p>
            </div>
          </label>

          {modo === "hard" && (
            <div className="space-y-3 rounded-lg border border-destructive/40 p-3">
              <div className="space-y-1">
                <Label htmlFor="ex-destino">Reatribuir leads, propostas, pedidos, clientes e tarefas para</Label>
                <select
                  id="ex-destino"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Selecione…</option>
                  {outros.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ex-nome">Digite <strong>{usuario.name}</strong> para confirmar</Label>
                <Input id="ex-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={confirmar}
            disabled={busy || (modo === "hard" && (!nomeConfere || !destino))}
            className="gap-1"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {modo === "soft" ? "Desativar usuário" : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
