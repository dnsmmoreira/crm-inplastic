import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileDown, Search, X } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PedidosEmAbertoReport } from "@/components/relatorios/PedidosEmAbertoReport";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import { PEDIDO_STAGES, type PedidoStageId } from "@/lib/pedidos.functions";
import { toast } from "sonner";
import { listPedidosRelatorio, assertPodeExportarRelatorio, type RelatorioPedidoRow } from "@/lib/relatorios.functions";

export const Route = createFileRoute("/relatorios")({
  component: RelatoriosPage,
  head: () => ({
    meta: [
      { title: "Relatórios — INPLASTIC - CRM" },
      { name: "description", content: "Relatório de pedidos operacionais com filtros por produto, cliente, período e fase." },
      { property: "og:title", content: "Relatórios — INPLASTIC - CRM" },
      { property: "og:description", content: "Relatório de pedidos operacionais com filtros combináveis e exportação." },
    ],
  }),
});

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy");
}

function inRange(iso: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  if (from && d < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

function RelatoriosPage() {
  const fetchPedidos = useServerFn(listPedidosRelatorio);
  const checkExport = useServerFn(assertPodeExportarRelatorio);
  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-pedidos"],
    queryFn: () => fetchPedidos(),
  });

  const [produto, setProduto] = useState("");
  const [cliente, setCliente] = useState("");
  const [criadoDe, setCriadoDe] = useState("");
  const [criadoAte, setCriadoAte] = useState("");
  const [entregaDe, setEntregaDe] = useState("");
  const [entregaAte, setEntregaAte] = useState("");
  const [stages, setStages] = useState<PedidoStageId[]>([]);

  const rows: RelatorioPedidoRow[] = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const p = produto.trim().toLowerCase();
    const c = cliente.trim().toLowerCase();
    return rows.filter((r) => {
      if (stages.length > 0 && !stages.includes(r.stage)) return false;
      if (c && !(r.cliente ?? "").toLowerCase().includes(c)) return false;
      if (p && !r.itens.some((i) => `${i.sku} ${i.description}`.toLowerCase().includes(p))) return false;
      if (!inRange(r.created_at, criadoDe, criadoAte)) return false;
      if (!inRange(r.previsao_entrega, entregaDe, entregaAte)) return false;
      return true;
    });
  }, [rows, produto, cliente, criadoDe, criadoAte, entregaDe, entregaAte, stages]);

  const totalGeral = filtered.reduce((s, r) => s + r.total, 0);
  const hasFilters =
    produto || cliente || criadoDe || criadoAte || entregaDe || entregaAte || stages.length > 0;

  function limpar() {
    setProduto(""); setCliente(""); setCriadoDe(""); setCriadoAte("");
    setEntregaDe(""); setEntregaAte(""); setStages([]);
  }

  function toggleStage(id: PedidoStageId) {
    setStages((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function stageLabel(id: PedidoStageId) {
    return PEDIDO_STAGES.find((s) => s.id === id)?.label ?? id;
  }

  function produtosTexto(r: RelatorioPedidoRow) {
    if (r.itens.length === 0) return "—";
    return r.itens.map((i) => `${i.sku} (${i.quantity} ${i.unit})`).join(", ");
  }

  async function exportCSV() {
    try {
      await checkExport();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exportação não permitida");
      return;
    }
    const header = ["Nº do pedido", "Cliente", "Produtos", "Data de criação", "Prazo de entrega", "Fase", "Total"];
    const lines = filtered.map((r) => [
      r.number,
      r.cliente ?? "",
      produtosTexto(r),
      fmtDate(r.created_at),
      fmtDate(r.previsao_entrega),
      stageLabel(r.stage),
      r.total.toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-pedidos-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    window.print();
  }

  return (
    <div className="p-6 space-y-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body * { visibility: hidden; }
          #relatorio-print, #relatorio-print * { visibility: visible; }
          #relatorio-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          #relatorio-print tr { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="font-display text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Relatórios operacionais do CRM.
        </p>
      </div>

      <Tabs defaultValue="pedidos" className="space-y-6">
        <TabsList className="no-print">
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="abertos">Pedidos em Aberto</TabsTrigger>
        </TabsList>

        <TabsContent value="abertos" className="space-y-6">
          <PedidosEmAbertoReport />
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-6">
      <div className="flex items-start justify-between gap-4 no-print">
        <p className="text-sm text-muted-foreground">
          Relatório de pedidos operacionais (gerados a partir de propostas ganhas).
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
            <FileDown className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-4 space-y-4 no-print">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Produto / SKU</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por SKU ou descrição" value={produto} onChange={(e) => setProduto(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <Input placeholder="Nome do cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data de criação</label>
            <div className="flex items-center gap-2">
              <Input type="date" value={criadoDe} onChange={(e) => setCriadoDe(e.target.value)} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={criadoAte} onChange={(e) => setCriadoAte(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Prazo de entrega</label>
            <div className="flex items-center gap-2">
              <Input type="date" value={entregaDe} onChange={(e) => setEntregaDe(e.target.value)} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={entregaAte} onChange={(e) => setEntregaAte(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Fase do pedido {stages.length > 0 ? `(${stages.length} selecionada${stages.length > 1 ? "s" : ""})` : "(todas)"}
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStages(PEDIDO_STAGES.map((s) => s.id))}>
                Selecionar todas
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStages([])}>
                Limpar fases
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {PEDIDO_STAGES.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={stages.includes(s.id)} onCheckedChange={() => toggleStage(s.id)} />
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {filtered.length} de {rows.length} pedidos · Total {formatBRL(totalGeral)}
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={limpar}>
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {/* Resultados */}
      <div id="relatorio-print" className="rounded-lg border bg-card overflow-x-auto">
        <div className="hidden print:block p-2 text-sm font-semibold">
          Relatório de Pedidos — {format(new Date(), "dd/MM/yyyy")}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Produto(s)</th>
              <th className="px-3 py-2 font-medium">Criação</th>
              <th className="px-3 py-2 font-medium">Prazo entrega</th>
              <th className="px-3 py-2 font-medium">Fase</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-destructive">{(error as Error).message}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum pedido encontrado com os filtros atuais.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className={cn("border-b last:border-0 hover:bg-muted/30")}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.number}</td>
                  <td className="px-3 py-2">{r.cliente ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{produtosTexto(r)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.previsao_entrega)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="font-normal">{stageLabel(r.stage)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={6}>Total ({filtered.length} pedidos)</td>
                <td className="px-3 py-2 text-right">{formatBRL(totalGeral)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
