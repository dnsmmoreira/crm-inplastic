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
import {
  DETALHE_MIN_CHARS,
  DETALHE_OBRIGATORIO_MSG,
  MOTIVOS_PERDA,
  MOTIVOS_PERDA_DESCRICAO,
  detalheValido,
  recontatoDias,
  type MotivoPerda,
} from "@/lib/motivos-perda";

/** Lista exibida no diálogo — vem do arquivo puro `motivos-perda.ts`. */
export const LOST_REASONS: { value: MotivoPerda; label: MotivoPerda }[] =
  MOTIVOS_PERDA.map((m) => ({ value: m, label: m }));

export type LostReasonPayload = {
  motivo: string;
  motivoLabel: string;
  observacao: string;
};

export function LostReasonDialog({
  open,
  leadLabel,
  leadLabels,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadLabel?: string;
  /** Modo em lote: lista de nomes dos leads selecionados. */
  leadLabels?: string[];
  onCancel: () => void;
  onConfirm: (payload: LostReasonPayload) => void | Promise<void>;
}) {
  const bulk = !!leadLabels && leadLabels.length > 0;

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

  const detalheOk = detalheValido(observacao);
  const podeConfirmar = !!motivo && detalheOk && !submitting;
  const dias = motivo ? recontatoDias(motivo as MotivoPerda) : null;

  const handleConfirm = async () => {
    if (!motivo || !detalheOk) return;
    setSubmitting(true);
    try {
      await onConfirm({ motivo, motivoLabel: motivo, observacao: observacao.trim() });
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
            {bulk
              ? `Informe o motivo para marcar ${leadLabels!.length} lead${leadLabels!.length > 1 ? "s" : ""} como Perdido.`
              : leadLabel
                ? `Informe o motivo antes de mover "${leadLabel}" para Perdido.`
                : "Informe o motivo antes de mover o lead para Perdido."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {bulk ? (
            <div className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
              <ul className="space-y-0.5">
                {leadLabels!.map((n, i) => (
                  <li key={`${n}-${i}`} className="truncate">• {n}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Label className="text-xs">Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motivo ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {MOTIVOS_PERDA_DESCRICAO[motivo as MotivoPerda]}
                {dias === null
                  ? " · sem recontato"
                  : ` · recontato em ${dias} dias`}
              </p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs">Detalhe *</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={DETALHE_OBRIGATORIO_MSG}
            />
            {!detalheOk ? (
              <p className="mt-1 text-[11px] text-destructive">
                {DETALHE_OBRIGATORIO_MSG} (mínimo {DETALHE_MIN_CHARS} caracteres)
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!podeConfirmar}>
            {submitting
              ? "Salvando..."
              : bulk
                ? `Marcar ${leadLabels!.length} como Perdido`
                : "Marcar como Perdido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
