/**
 * Simulação de parcelamento no cartão de crédito.
 *
 * Mostra a tabela 1x…máximo com o acréscimo da operadora e devolve, ao clicar
 * numa linha, o número de parcelas e o % de acréscimo escolhidos.
 */
import { CreditCard } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import { simularCartao, type SimulacaoLinha } from "@/lib/cartao-simulacao";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Subtotal dos itens menos o desconto. */
  valorBase: number;
  taxaPercent: number;
  maxParcelas: number;
  compostos: boolean;
  parcelasAtuais?: number | null;
  onEscolher: (linha: SimulacaoLinha) => void;
  onCancelar: () => void;
};

const pct = (v: number) => `${String(+v.toFixed(2)).replace(".", ",")}%`;

export function SimulacaoCartaoDialog({
  open,
  onOpenChange,
  valorBase,
  taxaPercent,
  maxParcelas,
  compostos,
  parcelasAtuais,
  onEscolher,
  onCancelar,
}: Props) {
  const linhas = simularCartao({ valorBase, taxaPercent, maxParcelas, compostos });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancelar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Simulação do cartão de crédito
          </DialogTitle>
          <DialogDescription>
            Valor base (itens menos desconto): <strong>{formatBRL(valorBase)}</strong>. Taxa da
            operadora: {pct(taxaPercent)} por parcela adicional,{" "}
            {compostos ? "juros compostos" : "juros simples"}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/70">
              <tr>
                <th className="p-2 text-left">Parcelas</th>
                <th className="p-2 text-right">Valor da parcela</th>
                <th className="p-2 text-right">Acréscimo (%)</th>
                <th className="p-2 text-right">Acréscimo (R$)</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.parcelas}
                  role="button"
                  tabIndex={0}
                  onClick={() => onEscolher(l)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onEscolher(l);
                  }}
                  className={cn(
                    "cursor-pointer border-t hover:bg-muted/50",
                    l.parcelas === parcelasAtuais && "bg-primary/10",
                  )}
                >
                  <td className="p-2 font-medium">
                    {l.parcelas}x
                    {l.parcelas === 1 && (
                      <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        sem acréscimo
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatBRL(l.valorParcela)}</td>
                  <td className="p-2 text-right tabular-nums">{pct(l.acrescimoPercent)}</td>
                  <td className="p-2 text-right tabular-nums">{formatBRL(l.acrescimoValor)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{formatBRL(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onCancelar();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
