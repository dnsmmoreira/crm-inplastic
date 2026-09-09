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
import { listVendedores } from "@/lib/clientes.functions";
import { transferirCliente, transferirLead } from "@/lib/leads-transferencia.functions";

/**
 * Diálogo único de troca de responsável do lead.
 *
 * NUNCA grava `leads.owner_id` pelo client: a RLS recusa para vendedor e o
 * caminho direto não leva tarefas, histórico nem aviso. Tudo passa pela server
 * function `transferirLead` (RPC `transferir_lead`, SECURITY DEFINER).
 */
export function TransferirLeadDialog({
  open,
  onOpenChange,
  leadIds = [],
  clienteId,
  donoAtual,
  onTransferido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Um ou vários leads (seleção em lote do funil). */
  leadIds?: string[];
  /** Carteira inteira de um cliente (tela de clientes). */
  clienteId?: string;
  /** Dono atual, quando todos os leads têm o mesmo — some da lista. */
  donoAtual?: string | null;
  /** Recebe o novo dono para atualizar o store local. */
  onTransferido: (novoOwnerId: string) => void;
}) {
  const listar = useServerFn(listVendedores);
  const transferir = useServerFn(transferirLead);
  const transferirCarteira = useServerFn(transferirCliente);
  const [vendedores, setVendedores] = useState<Array<{ id: string; name: string }>>([]);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestino("");
    setMotivo("");
    void listar()
      .then((v) => setVendedores(v as Array<{ id: string; name: string }>))
      .catch(() => setVendedores([]));
  }, [open, listar]);

  const disponiveis = vendedores.filter((v) => v.id !== donoAtual);
  const podeEnviar = destino !== "" && motivo.trim().length >= 5 && !salvando;
  const nomeDestino = vendedores.find((v) => v.id === destino)?.name ?? "";

  async function confirmar() {
    if (!podeEnviar) return;
    setSalvando(true);
    let movidas = 0;
    let ok = 0;
    try {
      if (clienteId) {
        const r = await transferirCarteira({
          data: { clienteId, novoOwnerId: destino, motivo: motivo.trim() },
        });
        onTransferido(destino);
        toast.success(`A carteira agora é de ${nomeDestino}`, {
          description:
            `${r.leadsMovidos} atendimento${r.leadsMovidos === 1 ? "" : "s"} e ` +
            `${r.tarefasMovidas} tarefa${r.tarefasMovidas === 1 ? "" : "s"} foram junto.`,
        });
        onOpenChange(false);
        return;
      }
      for (const leadId of leadIds) {
        const r = await transferir({
          data: { leadId, novoOwnerId: destino, motivo: motivo.trim() },
        });
        movidas += r.tarefasMovidas;
        ok += 1;
        onTransferido(destino);
      }
      toast.success(
        `${ok} cliente${ok > 1 ? "s" : ""} agora ${ok > 1 ? "são" : "é"} de ${nomeDestino}`,
        {
          description:
            movidas > 0
              ? `${movidas} tarefa${movidas > 1 ? "s" : ""} aberta${movidas > 1 ? "s foram" : " foi"} junto.`
              : "Nenhuma tarefa aberta para mover.",
        },
      );
      onOpenChange(false);
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
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {clienteId
              ? "Transferir carteira"
              : `Transferir ${leadIds.length > 1 ? `${leadIds.length} clientes` : "cliente"}`}
            {nomeDestino ? ` para ${nomeDestino}` : ""}
          </DialogTitle>
          <DialogDescription>
            {clienteId
              ? "O cliente, os atendimentos abertos, as tarefas e as conversas vão junto."
              : "As tarefas abertas e a conversa vão junto. O novo responsável é avisado na hora."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="transferir-lead-destino">Novo responsável</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger id="transferir-lead-destino" className="min-h-11">
                <SelectValue placeholder="Escolha a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transferir-lead-motivo">Motivo</Label>
            <Textarea
              id="transferir-lead-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente é da carteira da Bianca."
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório (mínimo 5 letras) — fica no histórico do cliente.
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
