import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { comprovacaoOk, contatoOk, contatoPosVendaValido } from "@/lib/pedido-avanco";
import {
  encerrarPosVendaAgora,
  registrarContatoPosVenda,
  type PedidoDetalhes,
} from "@/lib/pedidos.functions";

/**
 * Pós-venda só morre com contato + comprovação. Este bloco mostra o que falta
 * e dá o próximo ato: registrar o contato ou encerrar o pedido.
 */
export function PosVendaFechamentoBlock({
  pedido,
  onChanged,
}: {
  pedido: PedidoDetalhes;
  onChanged?: () => void;
}) {
  const registrarFn = useServerFn(registrarContatoPosVenda);
  const encerrarFn = useServerFn(encerrarPosVendaAgora);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  const temContato = contatoOk(pedido);
  const temComprovacao = comprovacaoOk(pedido);
  const encerrado = Boolean(pedido.encerrado_em);

  async function registrar() {
    if (!contatoPosVendaValido(nota)) {
      toast.error("Descreva o contato com o cliente (mín. 10 letras).");
      return;
    }
    setSalvando(true);
    try {
      const r = await registrarFn({ data: { pedido_id: pedido.id, nota } });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setNota("");
      toast.success(r.encerrado ? "Contato registrado. Pedido encerrado." : (r.aviso ?? "Contato registrado."));
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o contato.");
    } finally {
      setSalvando(false);
    }
  }

  async function encerrar() {
    setEncerrando(true);
    try {
      const r = await encerrarFn({ data: { pedido_id: pedido.id } });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Pedido encerrado.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível encerrar o pedido.");
    } finally {
      setEncerrando(false);
    }
  }

  return (
    <section className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PhoneCall className="h-4 w-4" />
        Fechamento do pós-venda
      </div>

      <ul className="mt-2 space-y-1 text-xs">
        <li className={temComprovacao ? "text-emerald-600" : "text-amber-600"}>
          {temComprovacao ? "✓" : "•"} Comprovação de entrega
        </li>
        <li className={temContato ? "text-emerald-600" : "text-amber-600"}>
          {temContato ? "✓" : "•"} Contato com o cliente
          {pedido.pos_venda_contato_em
            ? ` — ${format(new Date(pedido.pos_venda_contato_em), "dd MMM HH:mm", { locale: ptBR })}`
            : ""}
        </li>
      </ul>

      {encerrado ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          Encerrado em{" "}
          {format(new Date(pedido.encerrado_em!), "dd MMM yyyy HH:mm", { locale: ptBR })}
          {pedido.encerrado_motivo ? ` — ${pedido.encerrado_motivo}` : ""}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {!temContato && (
            <>
              <Label htmlFor="pos-venda-nota" className="text-xs">
                Como foi o contato com o cliente?
              </Label>
              <Textarea
                id="pos-venda-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Ex.: falei com o Marcos, produto conforme, sem reclamação."
              />
              <Button size="sm" onClick={registrar} disabled={salvando}>
                {salvando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Registrar contato
              </Button>
            </>
          )}
          {temContato && (
            <Button size="sm" onClick={encerrar} disabled={encerrando || !temComprovacao}>
              {encerrando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Encerrar pedido
            </Button>
          )}
          {temContato && !temComprovacao && (
            <p className="text-xs text-muted-foreground">
              Falta anexar a comprovação de entrega para encerrar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
