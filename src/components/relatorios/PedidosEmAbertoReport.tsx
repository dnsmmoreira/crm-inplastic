import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Download, GripVertical, Search, X } from "lucide-react";
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

type ColKey =
  | "number"
  | "cliente"
  | "produto"
  | "total"
  | "vendedor"
  | "created_at"
  | "previsao_entrega"
  | "stage"
  | "dias";
type GroupKey = "cliente" | "produto" | "vendedor" | "stage";
type PeriodoCampo = "created_at" | "previsao_entrega";

const LS_COLS = "relatorio-abertos:colunas";


const COLUMNS: {
  key: ColKey;
  label: string;
  align?: "right";
  sortable: boolean;
  groupable: boolean;
}[] = [
  { key: "number", label: "Nº", sortable: true, groupable: false },
  { key: "cliente", label: "Cliente", sortable: true, groupable: true },
  { key: "produto", label: "Produto(s)", sortable: false, groupable: true },
  { key: "total", label: "Valor total", align: "right", sortable: true, groupable: false },
  { key: "vendedor", label: "Vendedor", sortable: true, groupable: true },
  { key: "created_at", label: "Data do pedido", sortable: true, groupable: false },
  { key: "previsao_entrega", label: "Previsão entrega", sortable: true, groupable: false },
  { key: "stage", label: "Estágio", sortable: true, groupable: true },
  { key: "dias", label: "Dias em aberto", align: "right", sortable: true, groupable: false },
];

const DEFAULT_ORDER = COLUMNS.map((c) => c.key);


function colDef(key: ColKey) {
  return COLUMNS.find((c) => c.key === key)!;
}

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

function cellText(r: PedidoAbertoRow, key: ColKey): string {
  switch (key) {
    case "number":
      return r.number;
    case "cliente":
      return r.cliente ?? "";
    case "produto":
      return produtosTexto(r);
    case "total":
      return r.total.toFixed(2).replace(".", ",");
    case "vendedor":
      return r.vendedor_nome ?? "";
    case "created_at":
      return fmtDate(r.created_at);
    case "previsao_entrega":
      return fmtDate(r.previsao_entrega);
    case "stage":
      return stageLabel(r.stage);
    case "dias":
      return String(diasEmAberto(r.created_at));
  }
}

function groupValues(r: PedidoAbertoRow, key: GroupKey): string[] {
  switch (key) {
    case "cliente":
      return [r.cliente ?? "Sem cliente"];
    case "vendedor":
      return [r.vendedor_nome ?? "Sem vendedor"];
    case "stage":
      return [stageLabel(r.stage)];
    case "produto":
      return r.itens.length
        ? Array.from(new Set(r.itens.map((i) => i.description || i.sku)))
        : ["Sem produto"];
  }
}

type Node = { nome: string; rows: PedidoAbertoRow[]; children: Node[] | null; path: string };

function buildTree(rows: PedidoAbertoRow[], levels: GroupKey[], prefix = ""): Node[] {
  const [head, ...rest] = levels;
  const map = new Map<string, PedidoAbertoRow[]>();
  for (const r of rows) {
    for (const v of groupValues(r, head)) {
      const list = map.get(v) ?? [];
      list.push(r);
      map.set(v, list);
    }
  }
  return Array.from(map, ([nome, list]) => {
    const path = `${prefix}/${head}:${nome}`;
    return {
      nome,
      rows: list,
      path,
      children: rest.length ? buildTree(list, rest, path) : null,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function readLS<T>(key: string, fallback: T, validate: (v: unknown) => T | null): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return validate(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

/* ---------- DnD helpers ---------- */

function HeaderCell({
  col,
  sortKey,
  sortAsc,
  onSort,
  overId,
}: {
  col: (typeof COLUMNS)[number];
  sortKey: ColKey;
  sortAsc: boolean;
  onSort: (k: ColKey) => void;
  overId: string | null;
}) {
  const draggable = useDraggable({ id: `col:${col.key}` });
  const droppable = useDroppable({ id: `dropcol:${col.key}` });
  const isOver = overId === `dropcol:${col.key}`;
  return (
    <th
      ref={droppable.setNodeRef}
      className={cn(
        "relative px-3 py-2 font-medium select-none whitespace-nowrap",
        col.align === "right" && "text-right",
        draggable.isDragging && "opacity-40",
      )}
    >
      {isOver ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          ref={draggable.setNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
          className="cursor-grab text-muted-foreground/60 hover:text-foreground"
          title="Arraste para reordenar ou agrupar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(col.sortable && "cursor-pointer")}
          onClick={() => col.sortable && onSort(col.key)}
        >
          {col.label}
          {col.sortable && sortKey === col.key ? (sortAsc ? " ↑" : " ↓") : ""}
        </span>
      </span>
    </th>
  );
}




/* ---------- Componente principal ---------- */

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
  const [sortKey, setSortKey] = useState<ColKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({});
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const [colOrder, setColOrder] = useState<ColKey[]>(() =>
    readLS<ColKey[]>(LS_COLS, DEFAULT_ORDER, (v) => {
      if (!Array.isArray(v)) return null;
      const keep = v.filter((k): k is ColKey => DEFAULT_ORDER.includes(k as ColKey));
      const missing = DEFAULT_ORDER.filter((k) => !keep.includes(k));
      return [...keep, ...missing];
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_COLS, JSON.stringify(colOrder));
    } catch {
      /* ignore */
    }
  }, [colOrder]);

  const rows: PedidoAbertoRow[] = useMemo(() => data ?? [], [data]);

  // Agrupamento automático: prefixo de colunas agrupáveis da esquerda para a direita.
  const groupLevels = useMemo<GroupKey[]>(() => {
    const levels: GroupKey[] = [];
    for (const k of colOrder) {
      if (!colDef(k).groupable) break;
      levels.push(k as GroupKey);
    }
    return levels;
  }, [colOrder]);

  const visibleCols = useMemo(
    () => colOrder.filter((k) => !groupLevels.includes(k as GroupKey)),
    [colOrder, groupLevels],
  );


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

  const tree = useMemo(
    () => (groupLevels.length ? buildTree(sorted, groupLevels) : null),
    [sorted, groupLevels],
  );

  const totalGeral = filtered.reduce((s, r) => s + r.total, 0);
  const hasFilters = cliente || produto !== "todos" || vendedor !== "todos" || de || ate;

  function limpar() {
    setCliente("");
    setProduto("todos");
    setVendedor("todos");
    setDe("");
    setAte("");
  }


  function toggleSort(key: ColKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function onDragEnd(e: DragEndEvent) {
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    setActiveId(null);
    setOverId(null);
    if (!over || !active.startsWith("col:") || !over.startsWith("dropcol:")) return;
    const key = active.slice(4) as ColKey;
    const target = over.slice(8) as ColKey;
    if (target === key) return;
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== key);
      next.splice(next.indexOf(target), 0, key);
      return next;
    });
  }


  async function exportCSV() {
    try {
      await checkExport();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exportação não permitida");
      return;
    }
    const cols = colOrder;
    const header = [
      ...cols.map((k) => colDef(k).label),
      "Responsável atual",
      "Atrasado",
    ];
    const lines = sorted.map((r) => [
      ...cols.map((k) => cellText(r, k)),
      r.responsavel_nome ?? "",
      estaAtrasado(r.previsao_entrega) ? "Sim" : "Não",
    ]);
    const csv = [header, ...lines]
      .map((c) => c.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-em-aberto-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const COLS = visibleCols.length + 1;

  function Cell({ r, k }: { r: PedidoAbertoRow; k: ColKey }) {
    const atrasado = estaAtrasado(r.previsao_entrega);
    switch (k) {
      case "number":
        return <td className="px-3 py-2 font-medium whitespace-nowrap">{r.number}</td>;
      case "cliente":
        return <td className="px-3 py-2">{r.cliente ?? "—"}</td>;
      case "produto":
        return (
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
        );
      case "total":
        return <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(r.total)}</td>;
      case "vendedor":
        return (
          <td className="px-3 py-2">
            {r.vendedor_nome ?? "—"}
            {r.responsavel_nome && r.responsavel_id !== r.vendedor_id ? (
              <span className="block text-xs text-muted-foreground">
                Resp.: {r.responsavel_nome}
              </span>
            ) : null}
          </td>
        );
      case "created_at":
        return <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>;
      case "previsao_entrega":
        return (
          <td className="px-3 py-2 whitespace-nowrap">
            {atrasado ? (
              <Badge variant="destructive" className="font-normal">
                {fmtDate(r.previsao_entrega)}
              </Badge>
            ) : (
              fmtDate(r.previsao_entrega)
            )}
          </td>
        );
      case "stage":
        return (
          <td className="px-3 py-2">
            <Badge variant="outline" className="font-normal">
              {stageLabel(r.stage)}
            </Badge>
          </td>
        );
      case "dias":
        return (
          <td className="px-3 py-2 text-right whitespace-nowrap">{diasEmAberto(r.created_at)}</td>
        );
    }
  }

  function Linha({ r, rowKey }: { r: PedidoAbertoRow; rowKey: string }) {
    const atrasado = estaAtrasado(r.previsao_entrega);
    const aberto = !!expandidos[r.id];
    return (
      <Fragment>
        <tr
          className={cn("border-b last:border-0 hover:bg-muted/30", atrasado && "bg-destructive/5")}
        >
          {visibleCols.map((k) => (
            <Fragment key={`${rowKey}-${k}`}>
              <Cell r={r} k={k} />
            </Fragment>
          ))}
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

  function renderNodes(nodes: Node[], depth: number): ReactNode {
    return nodes.map((n) => {
      const fechado = !!colapsados[n.path];
      const subtotal = n.rows.reduce((s, r) => s + r.total, 0);
      return (
        <Fragment key={n.path}>
          <tr
            className={cn("border-b cursor-pointer", depth === 0 ? "bg-muted/40" : "bg-muted/20")}
            onClick={() => setColapsados((p) => ({ ...p, [n.path]: !p[n.path] }))}
          >
            <td colSpan={Math.max(1, COLS - 1)} className="px-3 py-2 font-medium">
              <span
                className="inline-flex items-center gap-1.5"
                style={{ paddingLeft: depth * 16 }}
              >
                {fechado ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {colDef(groupLevels[depth]).label}:
                </span>
                {n.nome}
                <span className="text-xs font-normal text-muted-foreground">
                  · {n.rows.length} pedido{n.rows.length > 1 ? "s" : ""}
                </span>
              </span>
            </td>
            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
              {formatBRL(subtotal)}
            </td>
          </tr>
          {!fechado
            ? n.children
              ? renderNodes(n.children, depth + 1)
              : n.rows.map((r) => (
                  <Linha key={`${n.path}-${r.id}`} r={r} rowKey={`${n.path}-${r.id}`} />
                ))
            : null}
        </Fragment>
      );
    });
  }

  const activeLabel = activeId ? colDef(activeId.slice(4) as ColKey).label : null;


  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 no-print">
          <p className="text-sm text-muted-foreground">
            Pedidos ainda não entregues, com destaque para os que passaram da previsão de entrega.
            Arraste os cabeçalhos para reordenar colunas — colunas agrupáveis nas primeiras
            posições viram níveis de agrupamento.

          </p>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={sorted.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        {/* Filtros */}
        <div className="rounded-lg border bg-card p-4 space-y-4 no-print">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Estado do agrupamento */}
        <div className="no-print text-xs text-muted-foreground">
          {groupLevels.length > 0 ? (
            <>
              <span className="font-medium text-foreground">Agrupado por: </span>
              {groupLevels.map((k) => colDef(k).label).join(" → ")}
            </>
          ) : (
            "Sem agrupamento — arraste uma coluna agrupável (Cliente, Produto(s), Vendedor, Estágio) para a primeira posição para agrupar."
          )}
        </div>


        {/* Tabela */}
        <div id="relatorio-print" className="rounded-lg border bg-card overflow-x-auto">
          <div className="hidden print:block p-2 text-sm font-semibold">
            Pedidos em Aberto — {format(new Date(), "dd/MM/yyyy")}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr className="border-b">
                {visibleCols.map((k) => (
                  <HeaderCell
                    key={k}
                    col={colDef(k)}
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    overId={overId}
                  />
                ))}
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
              ) : tree ? (
                renderNodes(tree, 0)
              ) : (
                sorted.map((r) => <Linha key={r.id} r={r} rowKey={r.id} />)
              )}
            </tbody>
            {sorted.length > 0 ? (
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={Math.max(1, COLS - 1)}>
                    Total geral ({filtered.length} pedidos)
                  </td>
                  <td className="px-3 py-2 text-right">{formatBRL(totalGeral)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <DragOverlay>
        {activeLabel ? (
          <div className="rounded-md border bg-background px-2 py-1 text-xs shadow-md">
            {activeLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
