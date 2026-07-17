import { useEffect, useState } from "react";
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

export const LOST_REASONS: { value: string; label: string }[] = [
  { value: "preco", label: "Preço" },
  { value: "concorrente", label: "Concorrente" },
  { value: "sem_orcamento", label: "Sem orçamento" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "prazo", label: "Prazo/entrega" },
  { value: "outro", label: "Outro" },
];

export type LostReasonPayload = {
  motivo: string;
  motivoLabel: string;
  observacao: string;
};

export function LostReasonDialog({
  open,
  leadLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadLabel?: string;
  onCancel: () => void;
  onConfirm: (payload: LostReasonPayload) => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setObservacao("");
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!motivo) return;
    const label = LOST_REASONS.find((r) => r.value === motivo)?.label ?? motivo;
    setSubmitting(true);
    try {
      await onConfirm({ motivo, motivoLabel: label, observacao: observacao.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Motivo da perda</DialogTitle>
          <DialogDescription>
            {leadLabel
              ? `Informe o motivo antes de mover "${leadLabel}" para Perdido.`
              : "Informe o motivo antes de mover o lead para Perdido."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Detalhes adicionais sobre a perda..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!motivo || submitting}>
            {submitting ? "Salvando..." : "Marcar como Perdido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
