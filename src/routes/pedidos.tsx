import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  type DragStartEvent,
} from "@dnd-kit/core";
import { Search, Package, Calendar as CalendarIcon, FileText, Truck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import {
  listPedidos,
  updatePedidoStage,
  PEDIDO_STAGES,
  type PedidoRow,
  type PedidoStageId,
} from "@/lib/pedidos.functions";

export const Route = createFileRoute("/pedidos")({
  component: PedidosKanbanPage,
  head: () => ({
    meta: [
      { title: "Pedidos — INPLASTIC - CRM" },
      { name: "description", content: "Kanban operacional de pedidos: do recebimento à entrega." },
    ],
  }),
});

function PedidosKanbanPage() {
  const listFn = useServerFn(listPedidos);
  const updateFn = useServerFn(updatePedidoStage);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const pedidosQ = useQuery({
    queryKey: ["pedidos", "kanban"],
    queryFn: () => listFn(),
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: (vars: { pedido_id: string; stage: PedidoStageId }) => updateFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["pedidos", "kanban"] });
      const prev = qc.getQueryData<PedidoRow[]>(["pedidos", "kanban"]);
      if (prev) {
        qc.setQueryData<PedidoRow[]>(
          ["pedidos", "kanban"],
          prev.map((p) => (p.id === vars.pedido_id ? { ...p, stage: vars.stage } : p)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pedidos", "kanban"], ctx.prev);
      toast.error("Falha ao mover pedido");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = pedidosQ.data ?? [];
    if (!q) return rows;
    return rows.filter((p) =>
      [p.number, p.lead_company ?? "", p.proposta_number ?? "", p.nf_numero ?? ""]
        .some((s) => s.toLowerCase().includes(q)),
    );
  }, [pedidosQ.data, search]);

  const byStage = useMemo(() => {
    const map: Record<PedidoStageId, PedidoRow[]> = {
      pedido_recebido: [], em_validacao: [], aguardando_aprovacao: [], aprovado_programado: [],
      em_producao: [], separacao_conferencia: [], faturado_aguardando_coleta: [],
      despachado_transporte: [], pedido_entregue: [], concluido: [],
    };
    filtered.forEach((p) => map[p.stage]?.push(p));
    return map;
  }, [filtered]);

  const active = activeId ? filtered.find((p) => p.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const pedidoId = String(e.active.id);
    const stage = String(e.over.id) as PedidoStageId;
    const pedido = filtered.find((p) => p.id === pedidoId);
    if (!pedido || pedido.stage === stage) return;
    mutation.mutate({ pedido_id: pedidoId, stage });
    const label = PEDIDO_STAGES.find((s) => s.id === stage)?.label;
    toast.success(`${pedido.number} → ${label}`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Kanban operacional — do recebimento à entrega. Coexiste com o Funil de Vendas.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº, cliente, proposta, NF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {pedidosQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando pedidos…</div>
      ) : pedidosQ.isError ? (
        <div className="text-sm text-destructive">Erro ao carregar pedidos.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum pedido ainda. Ao mover uma proposta aceita para <b>Ganho</b>, o pedido operacional
          é criado automaticamente e aparece aqui.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 md:-mx-8 px-4 md:px-8">
            {PEDIDO_STAGES.map((stage) => (
              <Column key={stage.id} stage={stage} pedidos={byStage[stage.id]} />
            ))}
          </div>
          <DragOverlay>{active && <PedidoCard pedido={active} dragging />}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({
  stage,
  pedidos,
}: {
  stage: (typeof PEDIDO_STAGES)[number];
  pedidos: PedidoRow[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = pedidos.reduce((s, p) => s + p.total, 0);
  return (
    <div className="w-[300px] shrink-0 flex flex-col">
      <div className="px-1 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: stage.color }}
          />
          <span className="font-medium text-sm truncate">{stage.label}</span>
          <Badge variant="secondary" className="text-xs">
            {pedidos.length}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatBRL(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl border border-dashed p-2 space-y-2 min-h-[400px] transition-colors",
          isOver ? "bg-accent/40 border-primary" : "bg-muted/30 border-border",
        )}
      >
        {pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} />
        ))}
        {pedidos.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">Solte aqui</div>
        )}
      </div>
    </div>
  );
}

function PedidoCard({ pedido, dragging = false }: { pedido: PedidoRow; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pedido.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        isDragging && "opacity-30",
        dragging && "shadow-xl rotate-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{pedido.number}</div>
          <div className="font-medium text-sm truncate">{pedido.lead_company ?? "—"}</div>
        </div>
        <div className="text-primary font-semibold text-sm shrink-0">{formatBRL(pedido.total)}</div>
      </div>
      {pedido.proposta_number && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">Proposta {pedido.proposta_number}</span>
        </div>
      )}
      {pedido.previsao_entrega && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span>
            Previsão {format(new Date(pedido.previsao_entrega), "dd MMM", { locale: ptBR })}
          </span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {pedido.equipe_responsavel && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            <Package className="h-2.5 w-2.5 mr-1" />
            {pedido.equipe_responsavel}
          </Badge>
        )}
        {pedido.nf_numero && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            <Truck className="h-2.5 w-2.5 mr-1" />
            NF {pedido.nf_numero}
          </Badge>
        )}
        {pedido.fiscal_status && pedido.fiscal_status !== "nao_iniciado" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {pedido.fiscal_status}
          </Badge>
        )}
      </div>
    </div>
  );
}
