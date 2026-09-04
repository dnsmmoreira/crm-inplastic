import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  gerarRomaneio,
  ROMANEIO_LABELS,
  type RomaneioTipo,
} from "@/lib/pedido-romaneios.functions";

/**
 * Gatilho OPCIONAL logo após gerar o pedido: oferece os dois romaneios
 * operacionais. Nada é obrigatório — os documentos seguem acessíveis depois
 * pela seção "Romaneios" do pedido.
 */
export function RomaneiosPosPedidoDialog({
  pedidoId,
  pedidoNumber,
  open,
  onOpenChange,
  titulo,
  descricao,
}: {
  pedidoId: string | null;
  pedidoNumber?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Texto do cabeçalho — o padrão é o do momento em que o pedido nasce. */
  titulo?: string;
  descricao?: string;
}) {
  const gerarFn = useServerFn(gerarRomaneio);
  const [busy, setBusy] = useState<RomaneioTipo | null>(null);

  async function gerar(tipo: RomaneioTipo) {
    if (!pedidoId) return;
    setBusy(tipo);
    try {
      const r = await gerarRomaneioEAbrir(gerarFn, pedidoId, tipo);
      if (r.estavaConcluido) {
        toast.warning("Este romaneio já tinha sido concluído — gerar de novo reinicia a conferência");
      } else {
        toast.success(`${ROMANEIO_LABELS[tipo]} gerado`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar romaneio");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo ?? "Pedido gerado!"}</DialogTitle>
          <DialogDescription>
            {pedidoNumber ? `Pedido ${pedidoNumber}. ` : ""}
            {descricao ??
              "Quer gerar algum documento operacional agora? É opcional — dá pra gerar depois pelo pedido."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="justify-start gap-2"
            disabled={busy !== null || !pedidoId}
            onClick={() => void gerar("separacao")}
          >
            <ClipboardList className="h-4 w-4" />
            {busy === "separacao" ? "Gerando…" : "Gerar romaneio de separação"}
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            disabled={busy !== null || !pedidoId}
            onClick={() => void gerar("conferencia_nf")}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {busy === "conferencia_nf" ? "Gerando…" : "Gerar romaneio de conferência para NF"}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Gera e abre o documento imprimível em nova aba. */
export async function gerarRomaneioEAbrir(
  gerarFn: (args: { data: { pedido_id: string; tipo: RomaneioTipo } }) => Promise<{
    regerado: boolean;
    estavaConcluido: boolean;
  }>,
  pedidoId: string,
  tipo: RomaneioTipo,
) {
  const r = await gerarFn({ data: { pedido_id: pedidoId, tipo } });
  window.open(`/romaneio/${pedidoId}/${tipo}`, "_blank", "noopener");
  return r;
}
