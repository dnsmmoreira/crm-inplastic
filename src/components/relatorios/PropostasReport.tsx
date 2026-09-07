import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/crm-store";
import {
  getRelatorioPropostas,
  type PeriodoPropostas,
} from "@/lib/relatorio-propostas.functions";
import type { MotivoRecusaAgregado, ResumoPropostas } from "@/lib/relatorio-propostas";

const PERIODOS: { id: PeriodoPropostas; label: string }[] = [
  { id: "30", label: "Últimos 30 dias" },
  { id: "90", label: "Últimos 90 dias" },
  { id: "180", label: "Últimos 180 dias" },
  { id: "ano", label: "Ano atual" },
];

function pct(v: number | null) {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function dias(v: number | null) {
  return v === null ? "—" : `${v.toFixed(1)} d`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Lista de motivos de recusa — reaproveitada no painel inicial. */
export function MotivosRecusaList({
  motivos,
  vazio = "Nenhuma recusa registrada no período.",
}: {
  motivos: MotivoRecusaAgregado[];
  vazio?: string;
}) {
  if (motivos.length === 0) {
    return <div className="text-sm text-muted-foreground italic">{vazio}</div>;
  }
  const maior = Math.max(...motivos.map((m) => m.total));
  return (
    <ul className="space-y-2">
      {motivos.map((m) => (
        <li key={m.motivo} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{m.motivo}</span>
            <span className="shrink-0 text-muted-foreground">
              {m.total} · {formatBRL(m.valor)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-destructive/70"
              style={{ width: `${maior > 0 ? (m.total / maior) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PropostasReport() {
  const fetchRel = useServerFn(getRelatorioPropostas);
  const [periodo, setPeriodo] = useState<PeriodoPropostas>("30");
  const [vendedorId, setVendedorId] = useState<string>("todos");

  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-propostas", periodo, vendedorId],
    queryFn: () =>
      fetchRel({
        data: { periodo, vendedorId: vendedorId === "todos" ? null : vendedorId },
      }),
  });

  const vendedores = useMemo(() => data?.vendedores ?? [], [data]);
  const resumo: ResumoPropostas | undefined = data?.resumo;

  function exportCSV() {
    if (!data) return;
    const header = [
      "Vendedor",
      "Enviadas",
      "Viraram pedido",
      "Recusadas",
      "Em aberto",
      "Conversão (%)",
      "Valor total",
      "Valor recusado",
      "Ticket médio",
      "Dias até pedido",
      "Dias até recusa",
    ];
    const linhas = vendedores.map((v) => [
      v.nome,
      v.resumo.enviadas,
      v.resumo.viraram_pedido,
      v.resumo.recusadas,
      v.resumo.em_aberto,
      v.resumo.conversao_pct === null ? "" : v.resumo.conversao_pct.toFixed(1).replace(".", ","),
      v.resumo.valor_total.toFixed(2).replace(".", ","),
      v.resumo.valor_recusado.toFixed(2).replace(".", ","),
      v.resumo.ticket_medio.toFixed(2).replace(".", ","),
      v.resumo.dias_medio_ate_pedido?.toFixed(1).replace(".", ",") ?? "",
      v.resumo.dias_medio_ate_recusa?.toFixed(1).replace(".", ",") ?? "",
    ]);
    const csv = [header, ...linhas]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-propostas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <p className="text-sm text-muted-foreground">
          Desempenho por proposta: envio, conversão em pedido e motivos de recusa.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoPropostas)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data?.isAdmin ? (
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.owner_id} value={v.owner_id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : error ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : resumo ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Propostas enviadas" value={String(resumo.enviadas)} />
            <Kpi
              label="Viraram pedido"
              value={String(resumo.viraram_pedido)}
              hint={formatBRL(resumo.valor_pedido)}
            />
            <Kpi
              label="Recusadas"
              value={String(resumo.recusadas)}
              hint={`Valor perdido ${formatBRL(resumo.valor_recusado)}`}
            />
            <Kpi label="Em aberto" value={String(resumo.em_aberto)} />
            <Kpi
              label="Conversão por proposta"
              value={pct(resumo.conversao_pct)}
              hint="pedido ÷ (pedido + recusada)"
            />
            <Kpi label="Ticket médio" value={formatBRL(resumo.ticket_medio)} />
            <Kpi label="Tempo até virar pedido" value={dias(resumo.dias_medio_ate_pedido)} />
            <Kpi label="Tempo até a recusa" value={dias(resumo.dias_medio_ate_recusa)} />
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Motivos de recusa</h2>
            <MotivosRecusaList motivos={data?.motivos ?? []} />
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 font-medium text-right">Enviadas</th>
                  <th className="px-3 py-2 font-medium text-right">Pedidos</th>
                  <th className="px-3 py-2 font-medium text-right">Recusadas</th>
                  <th className="px-3 py-2 font-medium text-right">Em aberto</th>
                  <th className="px-3 py-2 font-medium text-right">Conversão</th>
                  <th className="px-3 py-2 font-medium text-right">Valor recusado</th>
                  <th className="px-3 py-2 font-medium text-right">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhuma proposta no período.
                    </td>
                  </tr>
                ) : (
                  vendedores.map((v) => (
                    <tr key={v.owner_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">{v.nome}</td>
                      <td className="px-3 py-2 text-right">{v.resumo.enviadas}</td>
                      <td className="px-3 py-2 text-right">{v.resumo.viraram_pedido}</td>
                      <td className="px-3 py-2 text-right">{v.resumo.recusadas}</td>
                      <td className="px-3 py-2 text-right">{v.resumo.em_aberto}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="outline" className="font-normal">
                          {pct(v.resumo.conversao_pct)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{formatBRL(v.resumo.valor_recusado)}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(v.resumo.ticket_medio)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
