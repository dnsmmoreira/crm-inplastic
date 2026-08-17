import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import { PEDIDO_STAGES, type PedidoStageId } from "@/lib/pedidos.functions";
import {
  listPedidosEmAberto,
  assertPodeExportarRelatorio,
  type PedidoAbertoRow,
} from "@/lib/relatorios.functions";

type SortKey =
  | "number"
  | "cliente"
  | "total"
  | "vendedor"
  | "created_at"
  | "previsao_entrega"
  | "stage"
  | "dias";
type GroupBy = "nenhum" | "cliente" | "produto" | "vendedor";
type PeriodoCampo = "created_at" | "previsao_entrega";

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

function diasEmAberto(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

function estaAtrasado(previsao: string | null) {
  if (!previsao) return false;
  const d = new Date(`${previsao.slice(0, 10)}T23:59:59`).getTime();
  return !Number.isNaN(d) && d < Date.now();
}

function stageLabel(id: PedidoStageId) {
  return PEDIDO_STAGES.find((s) => s.id === id)?.label ?? id;
}

function produtoResumo(r: PedidoAbertoRow) {
  if (r.itens.length === 0) return "—";
  const first = r.itens[0];
  const base = `${first.description || first.sku} ×${first.quantity}`;
  const resto = r.itens.length - 1;
  return resto > 0 ? `${base} (+${resto} ${resto === 1 ? "item" : "itens"})` : base;
}

function produtosTexto(r: PedidoAbertoRow) {
  if (r.itens.length === 0) return "—";
  return r.itens.map((i) => `${i.sku || i.description} ×${i.quantity} ${i.unit}`).join(", ");
}

export function PedidosEmAbertoReport() {
  const fetchAbertos = useServerFn(listPedidosEmAberto);
  const checkExport = useServerFn(assertPodeExportarRelatorio);
  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-pedidos-abertos"],
    queryFn: () => fetchAbertos(),
  });

  const [cliente, setCliente] = useState("");
  const [produto, setProduto] = useState("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [periodoCampo, setPeriodoCampo] = useState<PeriodoCampo>("created_at");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("nenhum");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({});
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const rows: PedidoAbertoRow[] = useMemo(() => data ?? [], [data]);

  const produtosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const i of r.itens) set.add(i.description || i.sku);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const vendedoresDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const id = r.vendedor_id ?? "sem";
      map.set(id, r.vendedor_nome ?? "Sem vendedor");
    }
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const c = cliente.trim().toLowerCase();
    return rows.filter((r) => {
      if (c && !(r.cliente ?? "").toLowerCase().includes(c)) return false;
      if (produto !== "todos" && !r.itens.some((i) => (i.description || i.sku) === produto))
        return false;
      if (vendedor !== "todos" && (r.vendedor_id ?? "sem") !== vendedor) return false;
      const campo = periodoCampo === "created_at" ? r.created_at : r.previsao_entrega;
      if (!inRange(campo, de, ate)) return false;
      return true;
    });
  }, [rows, cliente, produto, vendedor, periodoCampo, de, ate]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const val = (r: PedidoAbertoRow) => {
      switch (sortKey) {
        case "number":
          return r.number;
        case "cliente":
          return r.cliente ?? "";
        case "total":
          return r.total;
        case "vendedor":
          return r.vendedor_nome ?? "";
        case "previsao_entrega":
          return r.previsao_entrega ?? "";
        case "stage":
          return stageLabel(r.stage);
        case "dias":
          return diasEmAberto(r.created_at);
        default:
          return r.created_at;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "pt-BR") * dir;
    });
  }, [filtered, sortKey, sortAsc]);

  const grupos = useMemo(() => {
    if (groupBy === "nenhum") return null;
    const map = new Map<string, PedidoAbertoRow[]>();
    for (const r of sorted) {
      let chaves: string[] = [];
      if (groupBy === "cliente") chaves = [r.cliente ?? "Sem cliente"];
      else if (groupBy === "vendedor") chaves = [r.vendedor_nome ?? "Sem vendedor"];
      else {
        chaves = r.itens.length
          ? Array.from(new Set(r.itens.map((i) => i.description || i.sku)))
          : ["Sem produto"];
      }
      for (const k of chaves) {
        const list = map.get(k) ?? [];
        list.push(r);
        map.set(k, list);
      }
    }
    return Array.from(map, ([nome, itens]) => ({ nome, itens })).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [sorted, groupBy]);

  const totalGeral = filtered.reduce((s, r) => s + r.total, 0);
  const hasFilters =
    cliente || produto !== "todos" || vendedor !== "todos" || de || ate || groupBy !== "nenhum";

  function limpar() {
    setCliente("");
    setProduto("todos");
    setVendedor("todos");
    setDe("");
    setAte("");
    setGroupBy("nenhum");
  }

  function toggleSort(key: SortKey) {
    if (groupBy !== "nenhum") return;
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  async function exportCSV() {
    try {
      await checkExport();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exportação não permitida");
      return;
    }
    const header = [
      "Nº do pedido",
      "Cliente",
      "Produtos",
      "Valor total",
      "Vendedor",
      "Responsável atual",
      "Data do pedido",
      "Previsão de entrega",
      "Estágio",
      "Dias em aberto",
      "Atrasado",
    ];
    const lines = sorted.map((r) => [
      r.number,
      r.cliente ?? "",
      produtosTexto(r),
      r.total.toFixed(2).replace(".", ","),
      r.vendedor_nome ?? "",
      r.responsavel_nome ?? "",
      fmtDate(r.created_at),
      fmtDate(r.previsao_entrega),
      stageLabel(r.stage),
      String(diasEmAberto(r.created_at)),
      estaAtrasado(r.previsao_entrega) ? "Sim" : "Não",
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-em-aberto-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const COLS = 10;

  function Linha({ r }: { r: PedidoAbertoRow }) {
    const atrasado = estaAtrasado(r.previsao_entrega);
    const aberto = !!expandidos[r.id];
    return (
      <Fragment>
        <tr className={cn("border-b last:border-0 hover:bg-muted/30", atrasado && "bg-destructive/5")}>
          <td className="px-3 py-2 font-medium whitespace-nowrap">{r.number}</td>
          <td className="px-3 py-2">{r.cliente ?? "—"}</td>
          <td className="px-3 py-2 text-muted-foreground">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setExpandidos((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  >
                    {produtoResumo(r)}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{produtosTexto(r)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </td>
          <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(r.total)}</td>
          <td className="px-3 py-2">
            {r.vendedor_nome ?? "—"}
            {r.responsavel_nome && r.responsavel_id !== r.vendedor_id ? (
              <span className="block text-xs text-muted-foreground">
                Resp.: {r.responsavel_nome}
              </span>
            ) : null}
          </td>
          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
          <td className="px-3 py-2 whitespace-nowrap">
            {atrasado ? (
              <Badge variant="destructive" className="font-normal">
                {fmtDate(r.previsao_entrega)}
              </Badge>
            ) : (
              fmtDate(r.previsao_entrega)
            )}
          </td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="font-normal">
              {stageLabel(r.stage)}
            </Badge>
          </td>
          <td className="px-3 py-2 text-right whitespace-nowrap">{diasEmAberto(r.created_at)}</td>
          <td className="px-3 py-2">
            {atrasado ? (
              <span className="text-xs font-medium text-destructive">Atrasado</span>
            ) : null}
          </td>
        </tr>
        {aberto && r.itens.length > 0 ? (
          <tr className="border-b bg-muted/20">
            <td colSpan={COLS} className="px-6 py-2 text-xs text-muted-foreground">
              <ul className="space-y-0.5">
                {r.itens.map((i, idx) => (
                  <li key={`${r.id}-${idx}`}>
                    {i.sku ? `${i.sku} — ` : ""}
                    {i.description} · {i.quantity} {i.unit}
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  const th = (key: SortKey, label: string, align?: "right") => (
    <th
      className={cn(
        "px-3 py-2 font-medium select-none",
        align === "right" && "text-right",
        groupBy === "nenhum" && "cursor-pointer",
      )}
      onClick={() => toggleSort(key)}
    >
      {label}
      {groupBy === "nenhum" && sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 no-print">
        <p className="text-sm text-muted-foreground">
          Pedidos ainda não entregues, com destaque para os que passaram da previsão de entrega.
        </p>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={sorted.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-4 space-y-4 no-print">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Nome do cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Produto</label>
            <Select value={produto} onValueChange={setProduto}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os produtos</SelectItem>
                {produtosDisponiveis.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedoresDisponiveis.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Agrupar por</label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="produto">Produto</SelectItem>
                <SelectItem value="vendedor">Vendedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Período por</label>
            <Select value={periodoCampo} onValueChange={(v) => setPeriodoCampo(v as PeriodoCampo)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Data do pedido</SelectItem>
                <SelectItem value="previsao_entrega">Previsão de entrega</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {filtered.length} de {rows.length} pedidos em aberto · Total {formatBRL(totalGeral)}
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={limpar}>
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabela */}
      <div id="relatorio-print" className="rounded-lg border bg-card overflow-x-auto">
        <div className="hidden print:block p-2 text-sm font-semibold">
          Pedidos em Aberto — {format(new Date(), "dd/MM/yyyy")}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr className="border-b">
              {th("number", "Nº")}
              {th("cliente", "Cliente")}
              <th className="px-3 py-2 font-medium">Produto(s)</th>
              {th("total", "Valor total", "right")}
              {th("vendedor", "Vendedor")}
              {th("created_at", "Data do pedido")}
              {th("previsao_entrega", "Previsão entrega")}
              {th("stage", "Estágio")}
              {th("dias", "Dias em aberto", "right")}
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLS} className="px-3 py-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={COLS} className="px-3 py-8 text-center text-destructive">
                  {(error as Error).message}
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum pedido em aberto com os filtros atuais.
                </td>
              </tr>
            ) : grupos ? (
              grupos.map((g) => {
                const fechado = !!colapsados[g.nome];
                const subtotal = g.itens.reduce((s, r) => s + r.total, 0);
                return (
                  <Fragment key={g.nome}>
                    <tr
                      className="border-b bg-muted/40 cursor-pointer"
                      onClick={() => setColapsados((p) => ({ ...p, [g.nome]: !p[g.nome] }))}
                    >
                      <td colSpan={COLS - 1} className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {fechado ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          {g.nome}
                          <span className="text-xs font-normal text-muted-foreground">
                            · {g.itens.length} pedido{g.itens.length > 1 ? "s" : ""}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {formatBRL(subtotal)}
                      </td>
                    </tr>
                    {!fechado ? g.itens.map((r) => <Linha key={`${g.nome}-${r.id}`} r={r} />) : null}
                  </Fragment>
                );
              })
            ) : (
              sorted.map((r) => <Linha key={r.id} r={r} />)
            )}
          </tbody>
          {sorted.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Total geral ({filtered.length} pedidos)
                </td>
                <td className="px-3 py-2 text-right">{formatBRL(totalGeral)}</td>
                <td className="px-3 py-2" colSpan={COLS - 4} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
