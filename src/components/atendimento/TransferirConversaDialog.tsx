import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarAtendentesParaTransferencia,
  transferirConversa,
} from "@/lib/atendimento.functions";

export type Atendente = { id: string; name: string };

/**
 * Transferência de conversa com destinatário e motivo obrigatórios.
 * O motivo vira rastro em `user_audit_log` e o destinatário recebe o alerta
 * com aceite obrigatório (gatilho de `whatsapp_conversas`).
 */
export function TransferirConversaDialog({
  open,
  onOpenChange,
  conversaId,
  donoAtual,
  onTransferido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversaId: string;
  donoAtual: string | null;
  onTransferido: () => void;
}) {
  const listar = useServerFn(listarAtendentesParaTransferencia);
  const transferir = useServerFn(transferirConversa);
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [destino, setDestino] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestino("");
    setMotivo("");
    void listar()
      .then((v) => setAtendentes(v as Atendente[]))
      .catch(() => setAtendentes([]));
  }, [open, listar]);

  const disponiveis = atendentes.filter((a) => a.id !== donoAtual);
  const podeEnviar = destino !== "" && motivo.trim().length >= 3 && !salvando;

  async function confirmar() {
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const r = await transferir({
        data: { conversaId, paraUserId: destino, motivo: motivo.trim() },
      });
      toast.success(`Conversa transferida para ${r.para}`);
      onOpenChange(false);
      onTransferido();
    } catch (e) {
      toast.error("Não foi possível transferir", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" /> Transferir conversa
          </DialogTitle>
          <DialogDescription>
            Quem receber é avisado na hora e precisa aceitar o atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="transferir-destino">Transferir para</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger id="transferir-destino" className="min-h-11">
                <SelectValue placeholder="Escolha o atendente" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {disponiveis.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum outro atendente disponível no momento.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transferir-motivo">Motivo da transferência</Label>
            <Textarea
              id="transferir-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente é da carteira do João; assunto técnico de produção."
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório — fica registrado no histórico do atendimento.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full min-h-11 sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button className="w-full min-h-11 sm:w-auto" disabled={!podeEnviar} onClick={confirmar}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
