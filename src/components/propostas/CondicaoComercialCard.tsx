import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useCrm, formatBRL, type PaymentInstallment } from "@/lib/crm-store";
import {
  CONDICOES_COMERCIAIS_KEY,
  addDaysToDateInput,
  dividirValor,
  formatDias,
  listarCondicoesComerciais,
} from "@/lib/condicoes-comerciais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Condição comercial da proposta: escolha da condição (prazos) + previsão de
 * faturamento, com geração automática das parcelas. A edição manual de data e
 * valor é preservada e só é sobrescrita ao clicar em "Refazer parcelas".
 */
export function CondicaoComercialCard({
  proposalId,
  total,
  readOnly = false,
}: {
  proposalId: string;
  total: number;
  readOnly?: boolean;
}) {
  const proposal = useCrm((s) => s.proposals.find((p) => p.id === proposalId));
  const updateProposal = useCrm((s) => s.updateProposal);

  const { data: condicoes = [] } = useQuery({
    queryKey: CONDICOES_COMERCIAIS_KEY,
    queryFn: listarCondicoesComerciais,
  });

  const ativas = useMemo(
    () => condicoes.filter((c) => c.ativo || c.id === proposal?.comercialConditionId),
    [condicoes, proposal?.comercialConditionId],
  );
  const condicao = condicoes.find((c) => c.id === proposal?.comercialConditionId);

  if (!proposal) return null;

  const installments = proposal.installments ?? [];

  const gerarParcelas = (condicaoId?: string, previsao?: string) => {
    const c = condicoes.find((x) => x.id === (condicaoId ?? proposal.comercialConditionId));
    const base = previsao ?? proposal.billingForecastDate;
    if (!c || !base) return;
    const valores = dividirValor(total, c.dias.length);
    const novas: PaymentInstallment[] = c.dias.map((d, i) => ({
      id: crypto.randomUUID(),
      days: d,
      amount: valores[i],
      notes: "",
      dueDate: addDaysToDateInput(base, d),
    }));
    updateProposal(proposal.id, { installments: novas });
  };

  const patchParcela = (id: string, patch: Partial<PaymentInstallment>) => {
    updateProposal(proposal.id, {
      installments: installments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const somaParcelas = installments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const divergente = installments.length > 0 && Math.abs(somaParcelas - total) > 0.009;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Condição comercial e vencimentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Condição comercial</Label>
          <Select
            value={proposal.comercialConditionId ?? ""}
            disabled={readOnly}
            onValueChange={(v) => {
              updateProposal(proposal.id, { comercialConditionId: v });
              gerarParcelas(v, proposal.billingForecastDate);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Escolha a condição (prazos)" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {ativas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="font-medium">{c.nome}</span>
                  <span className="text-muted-foreground text-xs ml-2">· {formatDias(c.dias)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Previsão de faturamento</Label>
          <Input
            type="date"
            disabled={readOnly}
            value={proposal.billingForecastDate ?? ""}
            onChange={(e) => {
              const v = e.target.value || undefined;
              updateProposal(proposal.id, { billingForecastDate: v });
              if (v) gerarParcelas(proposal.comercialConditionId, v);
            }}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Os vencimentos são calculados como previsão de faturamento + prazo de cada parcela.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {condicao ? `Vencimentos ${condicao.nome}` : "Nenhuma condição selecionada"}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || !condicao || !proposal.billingForecastDate}
            onClick={() => {
              gerarParcelas();
              toast.success("Parcelas refeitas");
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refazer parcelas
          </Button>
        </div>

        {installments.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 w-16">Parcela</TableHead>
                  <TableHead className="h-8">Vencimento</TableHead>
                  <TableHead className="h-8 text-right">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((p, i) => (
                  <TableRow key={p.id} className="text-xs">
                    <TableCell className="py-1.5">{i + 1}/{installments.length}</TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="date"
                        className="h-8"
                        disabled={readOnly}
                        value={p.dueDate ?? ""}
                        onChange={(e) => patchParcela(p.id, { dueDate: e.target.value || undefined })}
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="h-8 text-right"
                        disabled={readOnly}
                        value={p.amount}
                        onChange={(e) => patchParcela(p.id, { amount: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between px-3 py-2 border-t text-[11px]">
              <span className="text-muted-foreground">Soma das parcelas</span>
              <span className={divergente ? "font-semibold text-destructive" : "font-semibold"}>
                {formatBRL(somaParcelas)}
                {divergente ? ` · difere do total (${formatBRL(total)})` : ""}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
