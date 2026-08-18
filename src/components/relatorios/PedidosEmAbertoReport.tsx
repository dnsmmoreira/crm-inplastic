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
import { ChevronDown, ChevronRight, Download, GripVertical, Printer, Search, X } from "lucide-react";
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
  | "qtde"
  | "total"
  | "vendedor"
  | "created_at"
  | "previsao_entrega"
  | "stage"
  | "dias";
type GroupKey = "nenhum" | "produto" | "cliente" | "vendedor" | "stage";
type PeriodoCampo = "created_at" | "previsao_entrega";
type PeriodoPreset = "hoje" | "7dias" | "mes" | "custom";
type OrdemKey = "created_at" | "previsao_entrega" | "total" | "dias" | "cliente";

const LS_COLS = "relatorio-abertos:colunas";
const LS_PREFS = "relatorio-abertos:prefs";

const COLUMNS: {
  key: ColKey;
  label: string;
  align?: "right";
}[] = [
  { key: "number", label: "Nº" },
  { key: "cliente", label: "Cliente" },
  { key: "produto", label: "Produto(s)" },
  { key: "qtde", label: "Qtde", align: "right" },
  { key: "total", label: "Valor total", align: "right" },
  { key: "vendedor", label: "Vendedor" },
  { key: "created_at", label: "Data do pedido" },
  { key: "previsao_entrega", label: "Previsão entrega" },
  { key: "stage", label: "Estágio" },
  { key: "dias", label: "Dias em aberto", align: "right" },
];

const DEFAULT_ORDER = COLUMNS.map((c) => c.key);

const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "nenhum", label: "Nenhum" },
  { value: "produto", label: "Produto" },
  { value: "cliente", label: "Cliente" },
  { value: "vendedor", label: "Vendedor" },
  { value: "stage", label: "Estágio" },
];

const ORDEM_OPTIONS: { value: OrdemKey; label: string }[] = [
  { value: "created_at", label: "Data do pedido" },
  { value: "previsao_entrega", label: "Previsão de entrega" },
  { value: "total", label: "Valor" },
  { value: "dias", label: "Dias em aberto" },
  { value: "cliente", label: "Cliente" },
];

function colDef(key: ColKey) {
  return COLUMNS.find((c) => c.key === key)!;
}

function groupLabel(k: GroupKey) {
  return GROUP_OPTIONS.find((g) => g.value === k)?.label ?? "";
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

function qtdeItens(r: PedidoAbertoRow) {
  return r.itens.reduce((s, i) => s + Number(i.quantity || 0), 0);
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
    case "qtde":
      return String(qtdeItens(r));
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

function groupValues(r: PedidoAbertoRow, key: Exclude<GroupKey, "nenhum">): string[] {
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

type Node = {
  nome: string;
  rows: PedidoAbertoRow[];
  children: Node[] | null;
  path: string;
  /** Produto herdado do nível de agrupamento (quando agrupado por Produto). */
  produtoFiltro: string | null;
  /** SKU do produto quando o grupo é por Produto (null se não houver). */
  sku: string | null;
};

/** SKU do produto do grupo (quando distinto do rótulo exibido). */
function skuDoProduto(rows: PedidoAbertoRow[], nome: string): string | null {
  for (const r of rows) {
    for (const i of r.itens) {
      if ((i.description || i.sku) === nome && i.sku && i.sku !== nome) return i.sku;
    }
  }
  return null;
}


/** Unidades do pedido; se houver produto no contexto do grupo, só as daquele produto. */
function qtdeUnidades(r: PedidoAbertoRow, produtoFiltro: string | null) {
  const itens = produtoFiltro
    ? r.itens.filter((i) => (i.description || i.sku) === produtoFiltro)
    : r.itens;
  return itens.reduce((s, i) => s + Number(i.quantity || 0), 0);
}

function buildTree(
  rows: PedidoAbertoRow[],
  levels: Exclude<GroupKey, "nenhum">[],
  prefix = "",
  produtoHerdado: string | null = null,
): Node[] {
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
    const produtoFiltro =
      head === "produto" && nome !== "Sem produto" ? nome : produtoHerdado;
    return {
      nome,
      rows: list,
      path,
      produtoFiltro,
      children: rest.length ? buildTree(list, rest, path, produtoFiltro) : null,
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

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function presetRange(p: PeriodoPreset): { de: string; ate: string } | null {
  const hoje = new Date();
  if (p === "hoje") return { de: isoDay(hoje), ate: isoDay(hoje) };
  if (p === "7dias") {
    const d = new Date(hoje.getTime() - 6 * 86_400_000);
    return { de: isoDay(d), ate: isoDay(hoje) };
  }
  if (p === "mes") {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { de: isoDay(d), ate: isoDay(hoje) };
  }
  return null;
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body * { visibility: hidden !important; }
  #relatorio-abertos-print, #relatorio-abertos-print * { visibility: visible !important; }
  #relatorio-abertos-print { position: absolute; left: 0; top: 0; width: 100%; }
  #relatorio-abertos-print { border: none !important; overflow: visible !important; }
  #relatorio-abertos-print table { font-size: 10px; width: 100%; }
  #relatorio-abertos-print th, #relatorio-abertos-print td { padding: 2px 4px !important; }
  #relatorio-abertos-print thead { position: static !important; }
  .no-print { display: none !important; }
}
`;

/* ---------- DnD: reordenação de colunas (sem efeito de agrupamento) ---------- */

function HeaderCell({
  col,
  overId,
  sticky,
}: {
  col: (typeof COLUMNS)[number];
  overId: string | null;
  sticky: boolean;
}) {
  const draggable = useDraggable({ id: `col:${col.key}` });
  const droppable = useDroppable({ id: `dropcol:${col.key}` });
  const isOver = overId === `dropcol:${col.key}`;
  return (
    <th
      ref={droppable.setNodeRef}
      className={cn(
        "relative bg-muted/50 px-3 py-2 font-medium select-none whitespace-nowrap",
        sticky && "sticky top-0 z-10",
        col.align === "right" && "text-right",
        draggable.isDragging && "opacity-40",
      )}
    >
      {isOver ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
      <span className={cn("inline-flex items-center gap-1", col.align === "right" && "justify-end")}>
        <button
          type="button"
          ref={draggable.setNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
          className="cursor-grab text-muted-foreground/60 hover:text-foreground no-print"
          title="Arraste para reordenar a coluna"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {col.label}
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

  const prefs = useMemo(
    () =>
      readLS<{
        grupo: GroupKey;
        sub: GroupKey;
        ordem: OrdemKey;
        preset: PeriodoPreset;
        periodoCampo: PeriodoCampo;
        de: string;
        ate: string;
      }>(
        LS_PREFS,
        {
          grupo: "nenhum",
          sub: "nenhum",
          ordem: "created_at",
          preset: "mes",
          periodoCampo: "created_at",
          de: "",
          ate: "",
        },
        (v) => (v && typeof v === "object" ? (v as never) : null),
      ),
    [],
  );

  const [cliente, setCliente] = useState("");
  const [produto, setProduto] = useState("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [preset, setPreset] = useState<PeriodoPreset>(prefs.preset ?? "mes");
  const [periodoCampo, setPeriodoCampo] = useState<PeriodoCampo>(prefs.periodoCampo ?? "created_at");
  const [de, setDe] = useState(prefs.de ?? "");
  const [ate, setAte] = useState(prefs.ate ?? "");
  const [grupo, setGrupo] = useState<GroupKey>(prefs.grupo ?? "nenhum");
  const [sub, setSub] = useState<GroupKey>(prefs.sub ?? "nenhum");
  const [ordem, setOrdem] = useState<OrdemKey>(prefs.ordem ?? "created_at");
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

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LS_PREFS,
        JSON.stringify({ grupo, sub, ordem, preset, periodoCampo, de, ate }),
      );
    } catch {
      /* ignore */
    }
  }, [grupo, sub, ordem, preset, periodoCampo, de, ate]);

  // Período efetivo: presets calculam as datas; "custom" usa os campos.
  const range = useMemo(() => presetRange(preset) ?? { de, ate }, [preset, de, ate]);

  const rows: PedidoAbertoRow[] = useMemo(() => data ?? [], [data]);

  const groupLevels = useMemo<Exclude<GroupKey, "nenhum">[]>(() => {
    const l: Exclude<GroupKey, "nenhum">[] = [];
    if (grupo !== "nenhum") l.push(grupo);
    if (grupo !== "nenhum" && sub !== "nenhum" && sub !== grupo) l.push(sub);
    return l;
  }, [grupo, sub]);

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
      if (!inRange(campo, range.de, range.ate)) return false;
      return true;
    });
  }, [rows, cliente, produto, vendedor, periodoCampo, range]);

  const sorted = useMemo(() => {
    const val = (r: PedidoAbertoRow): string | number => {
      switch (ordem) {
        case "total":
          return r.total;
        case "dias":
          return diasEmAberto(r.created_at);
        case "cliente":
          return r.cliente ?? "";
        case "previsao_entrega":
          return r.previsao_entrega ?? "";
        default:
          return r.created_at;
      }
    };
    const asc = ordem === "cliente" || ordem === "previsao_entrega";
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "pt-BR");
      return asc ? cmp : -cmp;
    });
  }, [filtered, ordem]);

  const tree = useMemo(
    () => (groupLevels.length ? buildTree(sorted, groupLevels) : null),
    [sorted, groupLevels],
  );

  const totalGeral = filtered.reduce((s, r) => s + r.total, 0);
  const qtdeGeral = filtered.reduce((s, r) => s + qtdeItens(r), 0);
  const hasFilters = cliente || produto !== "todos" || vendedor !== "todos";

  function limpar() {
    setCliente("");
    setProduto("todos");
    setVendedor("todos");
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
      ...(groupLevels[0] ? [`Grupo (${groupLabel(groupLevels[0])})`] : []),
      ...(groupLevels[1] ? [`Subgrupo (${groupLabel(groupLevels[1])})`] : []),
      ...cols.map((k) => colDef(k).label),
      "Responsável atual",
      "Atrasado",
    ];
    const lines: string[][] = [];
    const push = (r: PedidoAbertoRow, g?: string, s?: string) => {
      lines.push([
        ...(groupLevels[0] ? [g ?? ""] : []),
        ...(groupLevels[1] ? [s ?? ""] : []),
        ...cols.map((k) => cellText(r, k)),
        r.responsavel_nome ?? "",
        estaAtrasado(r.previsao_entrega) ? "Sim" : "Não",
      ]);
    };
    if (tree) {
      for (const n of tree) {
        if (n.children) {
          for (const c of n.children) for (const r of c.rows) push(r, n.nome, c.nome);
        } else {
          for (const r of n.rows) push(r, n.nome);
        }
      }
    } else {
      for (const r of sorted) push(r);
    }
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

  const COLS = colOrder.length + 1;

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
      case "qtde":
        return <td className="px-3 py-2 text-right whitespace-nowrap">{qtdeItens(r)}</td>;
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

  function Linha({ r, rowKey, depth }: { r: PedidoAbertoRow; rowKey: string; depth: number }) {
    const atrasado = estaAtrasado(r.previsao_entrega);
    const aberto = !!expandidos[r.id];
    return (
      <Fragment>
        <tr
          className={cn("border-b last:border-0 hover:bg-muted/30", atrasado && "bg-destructive/5")}
        >
          {colOrder.map((k, idx) => (
            <Fragment key={`${rowKey}-${k}`}>
              {idx === 0 && depth > 0 ? (
                <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 20 }}>
                  <span className="font-medium">{cellText(r, k)}</span>
                </td>
              ) : (
                <Cell r={r} k={k} />
              )}
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

  function GroupRow({ n, depth }: { n: Node; depth: number }) {
    const fechado = !!colapsados[n.path];
    const subtotal = n.rows.reduce((s, r) => s + r.total, 0);
    const qtde = n.rows.reduce((s, r) => s + qtdeUnidades(r, n.produtoFiltro), 0);
    const atrasados = n.rows.filter((r) => estaAtrasado(r.previsao_entrega)).length;
    const pct = totalGeral > 0 ? (subtotal / totalGeral) * 100 : 0;
    // Ordem visual das colunas numéricas para os agregados
    const numericos: Partial<Record<ColKey, ReactNode>> = {
      qtde: qtde,
      total: formatBRL(subtotal),
      dias: `${n.rows.length} ped.`,
    };
    let primeiraLivre = true;
    return (
      <tr
        className={cn(
          "border-b cursor-pointer",
          depth === 0 ? "bg-muted/50 font-medium" : "bg-muted/25",
        )}
        onClick={() => setColapsados((p) => ({ ...p, [n.path]: !p[n.path] }))}
      >
        {colOrder.map((k) => {
          const agg = numericos[k];
          if (agg !== undefined) {
            return (
              <td key={k} className="px-3 py-2 text-right whitespace-nowrap">
                {agg}
              </td>
            );
          }
          if (primeiraLivre) {
            primeiraLivre = false;
            return (
              <td key={k} className="px-3 py-2">
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ paddingLeft: depth * 16 }}
                >
                  {fechado ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {groupLabel(groupLevels[depth])}:
                  </span>
                  {n.nome}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {n.rows.length} pedido{n.rows.length > 1 ? "s" : ""} ·{" "}
                    {qtde.toLocaleString("pt-BR")} un · {pct.toFixed(1)}%
                  </span>
                  {atrasados > 0 ? (
                    <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px]">
                      {atrasados} atrasado{atrasados > 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                </span>
              </td>
            );
          }
          return <td key={k} className="px-3 py-2" />;
        })}
        <td className="px-3 py-2" />
      </tr>
    );
  }

  function renderNodes(nodes: Node[], depth: number): ReactNode {
    return nodes.map((n) => {
      const fechado = !!colapsados[n.path];
      return (
        <Fragment key={n.path}>
          <GroupRow n={n} depth={depth} />
          {!fechado
            ? n.children
              ? renderNodes(n.children, depth + 1)
              : n.rows.map((r) => (
                  <Linha
                    key={`${n.path}-${r.id}`}
                    r={r}
                    rowKey={`${n.path}-${r.id}`}
                    depth={depth + 1}
                  />
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
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 no-print">
          <p className="text-sm text-muted-foreground">
            Pedidos ainda não entregues, com destaque para os que passaram da previsão de entrega. O
            relatório atualiza ao vivo conforme os filtros abaixo.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={sorted.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Painel de controle */}
        <div className="rounded-lg border bg-card p-4 space-y-4 no-print">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PeriodoPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                  <SelectItem value="mes">Mês atual</SelectItem>
                  <SelectItem value="custom">De um período</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
              <Input
                type="date"
                value={preset === "custom" ? de : range.de}
                disabled={preset !== "custom"}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data final</label>
              <Input
                type="date"
                value={preset === "custom" ? ate : range.ate}
                disabled={preset !== "custom"}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data considerada</label>
              <Select value={periodoCampo} onValueChange={(v) => setPeriodoCampo(v as PeriodoCampo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Data do pedido</SelectItem>
                  <SelectItem value="previsao_entrega">Previsão de entrega</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Agrupar por</label>
              <Select
                value={grupo}
                onValueChange={(v) => {
                  const g = v as GroupKey;
                  setGrupo(g);
                  if (g === "nenhum" || g === sub) setSub("nenhum");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Sub agrupar por</label>
              <Select
                value={sub}
                onValueChange={(v) => setSub(v as GroupKey)}
                disabled={grupo === "nenhum"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.filter((o) => o.value !== grupo).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
              <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDEM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
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

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground">
              {filtered.length} de {rows.length} pedidos em aberto ·{" "}
              {qtdeGeral.toLocaleString("pt-BR")} un · Total{" "}
              {formatBRL(totalGeral)}
              {groupLevels.length
                ? ` · Agrupado por ${groupLevels.map(groupLabel).join(" → ")}`
                : ""}
            </div>
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={limpar}>
                <X className="h-3 w-3 mr-1" /> Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>

        {/* Tabela */}
        <div
          id="relatorio-abertos-print"
          className="rounded-lg border bg-card overflow-x-auto max-h-[70vh] overflow-y-auto"
        >
          <div className="hidden print:block p-2 text-sm font-semibold">
            Pedidos em Aberto — {format(new Date(), "dd/MM/yyyy")}
            {groupLevels.length
              ? ` · Agrupado por ${groupLevels.map(groupLabel).join(" → ")}`
              : ""}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="border-b">
                {colOrder.map((k) => (
                  <HeaderCell key={k} col={colDef(k)} overId={overId} sticky />
                ))}
                <th className="sticky top-0 z-10 bg-muted/50 px-3 py-2 font-medium" />
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
                sorted.map((r) => <Linha key={r.id} r={r} rowKey={r.id} depth={0} />)
              )}
            </tbody>
            {sorted.length > 0 ? (
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={Math.max(1, COLS - 1)}>
                    Total geral ({filtered.length} pedidos ·{" "}
                    {qtdeGeral.toLocaleString("pt-BR")} un)
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
