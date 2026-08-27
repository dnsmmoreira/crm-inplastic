import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  alternarConferencia,
  buildConferenciaEntries,
  contarConfirmados,
  estadoInicialConferencia,
  todosConfirmados,
  type ConferenciaEntry,
  type ConferenciaInput,
} from "@/lib/conferencia-final";

/**
 * Conferência final antes de gerar/solicitar o pedido.
 * Componente novo e isolado — nada a ver com o checklist operacional de pedidos.
 * O estado nasce zerado a cada abertura (nunca persistido).
 */
export function ConferenciaFinalDialog({
  open,
  onOpenChange,
  input,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  input: ConferenciaInput;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  // A key remonta o conteúdo a cada abertura, garantindo checklist zerado.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <ConferenciaConteudo
            input={input}
            confirmLabel={confirmLabel}
            busy={busy}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConferenciaConteudo({
  input,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  input: ConferenciaInput;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const entries = useMemo(() => buildConferenciaEntries(input), [input]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>(estadoInicialConferencia);

  const itens = entries.filter((e) => e.grupo === "item");
  const gerais = entries.filter((e) => e.grupo === "geral");
  const feitos = contarConfirmados(entries, marcados);
  const liberado = todosConfirmados(entries, marcados) && itens.length > 0;

  const toggle = (id: string) => setMarcados((m) => alternarConferencia(m, id));

  const Linha = (e: ConferenciaEntry) => (
    <label
      key={e.id}
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer transition-colors",
        marcados[e.id] ? "border-emerald-500/50 bg-emerald-500/5" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        checked={marcados[e.id] === true}
        onCheckedChange={() => toggle(e.id)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block font-medium">{e.label}</span>
        <span className="block text-xs text-muted-foreground">{e.detail}</span>
      </span>
    </label>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" /> Conferência final
        </DialogTitle>
        <DialogDescription>
          Revise item a item e os dados combinados. Confirme cada linha para liberar a geração do
          pedido.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[55vh] pr-3">
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Itens ({itens.length})
            </h3>
            {itens.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs italic text-muted-foreground">
                Nenhum item na proposta — adicione ao menos um item antes de gerar o pedido.
              </p>
            ) : (
              <div className="space-y-2">{itens.map(Linha)}</div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Dados gerais</h3>
            <div className="space-y-2">{gerais.map(Linha)}</div>
          </section>
        </div>
      </ScrollArea>

      <DialogFooter className="sm:justify-between">
        <span className="self-center text-xs text-muted-foreground">
          {feitos}/{entries.length} confirmados
        </span>
        <span className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button className="gap-2" disabled={!liberado || busy} onClick={onConfirm}>
            <CheckCircle2 className="h-4 w-4" /> {confirmLabel}
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}
