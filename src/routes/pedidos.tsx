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
import {
  Search, Calendar as CalendarIcon, FileText, Truck, User, Clock,
  AlertTriangle, Flame, Headphones, Ban,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import {
  listPedidos,
  updatePedidoStage,
  PEDIDO_STAGES,
  ALLOWED_FORWARD,
  isBackward,
  isTransitionAllowed,
  type PedidoRow,
  type PedidoStageId,
} from "@/lib/pedidos.functions";
import { PedidoDetailDrawer } from "@/components/pedidos/PedidoDetailDrawer";

export const Route = createFileRoute("/pedidos")({
  component: PedidosKanbanPage,
  head: () => ({
    meta: [
      { title: "Pedidos — INPLASTIC - CRM" },
      { name: "description", content: "Kanban operacional de pedidos: do recebimento à entrega." },
    ],
  }),
});

type PendingBackward = {
  pedidoId: string;
  pedidoNumber: string;
  from: PedidoStageId;
  to: PedidoStageId;
};

function PedidosKanbanPage() {
  const listFn = useServerFn(listPedidos);
  const updateFn = useServerFn(updatePedidoStage);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingBackward, setPendingBackward] = useState<PendingBackward | null>(null);
  const [openPedidoId, setOpenPedidoId] = useState<string | null>(null);

  const pedidosQ = useQuery({
    queryKey: ["pedidos", "kanban"],
    queryFn: () => listFn(),
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: (vars: { pedido_id: string; stage: PedidoStageId; motivo?: string }) =>
      updateFn({ data: vars }),
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
    onSuccess: (res) => {
      if (res && "ok" in res && !res.ok) {
        toast.error(res.message);
        void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
      void qc.invalidateQueries({ queryKey: ["pipeline", "leads-com-pedido"] });
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

  const activePedido = activeId ? filtered.find((p) => p.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    const draggedId = String(e.active.id);
    setActiveId(null);
    if (!e.over) return;
    const target = String(e.over.id) as PedidoStageId;
    const pedido = filtered.find((p) => p.id === draggedId);
    if (!pedido) return;
    const from = pedido.stage;
    if (from === target) return;

    if (target === "concluido" && (pedido.ocorrencias_abertas ?? 0) > 0) {
      toast.error(
        "Não é possível concluir: há ocorrência(s) em aberto. Resolva-as antes de concluir.",
      );
      return;
    }

    if (!isTransitionAllowed(from, target)) {
      const permitidas = ALLOWED_FORWARD[from]
        .map((s) => PEDIDO_STAGES.find((x) => x.id === s)?.label ?? s)
        .join(", ");
      toast.error(
        permitidas
          ? `Transição não permitida. Avanço possível: ${permitidas}. Retornos permitidos exigem motivo.`
          : "Transição não permitida a partir desta etapa.",
      );
      return;
    }

    if (isBackward(from, target)) {
      setPendingBackward({
        pedidoId: pedido.id,
        pedidoNumber: pedido.number,
        from,
        to: target,
      });
      return;
    }

    mutation.mutate({ pedido_id: pedido.id, stage: target });
    const label = PEDIDO_STAGES.find((s) => s.id === target)?.label;
    toast.success(`${pedido.number} → ${label}`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Kanban operacional — avanços restritos por matriz; retornos exigem motivo. Faturamento é
            status, não etapa.
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
            {PEDIDO_STAGES.map((stage) => {
              const blockedByOcorrencia =
                !!activePedido &&
                stage.id === "concluido" &&
                (activePedido.ocorrencias_abertas ?? 0) > 0;
              const canDrop = activePedido
                ? isTransitionAllowed(activePedido.stage, stage.id) && !blockedByOcorrencia
                : true;
              const isBack = activePedido ? isBackward(activePedido.stage, stage.id) : false;
              return (
                <Column
                  key={stage.id}
                  stage={stage}
                  pedidos={byStage[stage.id]}
                  dragActive={!!activePedido && activePedido.stage !== stage.id}
                  canDrop={canDrop}
                  blockedReason={blockedByOcorrencia ? "Ocorrência aberta" : null}
                  isBackwardTarget={isBack && canDrop}
                  onOpen={setOpenPedidoId}
                />
              );
            })}
          </div>
          <DragOverlay>{activePedido && <PedidoCard pedido={activePedido} dragging />}</DragOverlay>
        </DndContext>
      )}

      <PedidoDetailDrawer pedidoId={openPedidoId} onClose={() => setOpenPedidoId(null)} />

      <BackwardMotiveDialog
        pending={pendingBackward}
        onCancel={() => setPendingBackward(null)}
        onConfirm={(motivo) => {
          if (!pendingBackward) return;
          mutation.mutate({
            pedido_id: pendingBackward.pedidoId,
            stage: pendingBackward.to,
            motivo,
          });
          const label = PEDIDO_STAGES.find((s) => s.id === pendingBackward.to)?.label;
          toast.success(`${pendingBackward.pedidoNumber} ↺ ${label}`);
          setPendingBackward(null);
        }}
      />
    </div>
  );
}

function Column({
  stage,
  pedidos,
  dragActive,
  canDrop,
  isBackwardTarget,
  onOpen,
}: {
  stage: (typeof PEDIDO_STAGES)[number];
  pedidos: PedidoRow[];
  dragActive: boolean;
  canDrop: boolean;
  isBackwardTarget: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: dragActive && !canDrop });
  const total = pedidos.reduce((s, p) => s + p.total, 0);
  const showBlocked = dragActive && !canDrop;
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
          {dragActive && canDrop && isBackwardTarget && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border-amber-500/30">
              retorno · motivo
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatBRL(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl border border-dashed p-2 space-y-2 min-h-[400px] transition-colors relative",
          isOver && canDrop && !isBackwardTarget && "bg-accent/40 border-primary",
          isOver && canDrop && isBackwardTarget && "bg-amber-500/10 border-amber-500",
          showBlocked && "bg-muted/10 border-border/40 opacity-50",
          !isOver && !showBlocked && "bg-muted/30 border-border",
        )}
      >
        {showBlocked && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/80 border rounded-md px-2 py-1">
              <Ban className="h-3 w-3" /> Não permitido
            </div>
          </div>
        )}
        {pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} onOpen={onOpen} />
        ))}
        {pedidos.length === 0 && !showBlocked && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">Solte aqui</div>
        )}
      </div>
    </div>
  );
}

function PedidoCard({
  pedido,
  dragging = false,
  onOpen,
}: {
  pedido: PedidoRow;
  dragging?: boolean;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pedido.id });

  const diasNaEtapa = Math.max(
    0,
    differenceInCalendarDays(new Date(), new Date(pedido.stage_changed_at)),
  );

  const terminalStages: PedidoStageId[] = ["pedido_entregue", "concluido"];
  const previsao = pedido.previsao_entrega ? new Date(pedido.previsao_entrega) : null;
  const atrasado =
    previsao !== null &&
    !terminalStages.includes(pedido.stage) &&
    differenceInCalendarDays(new Date(), previsao) > 0;

  const responsavel =
    pedido.responsavel_nome ?? pedido.equipe_responsavel ?? pedido.vendedor_nome ?? null;

  const forma = pedido.forma_atendimento?.trim() || null;

  const pendencias: string[] = [];
  if (pedido.stage === "aguardando_aprovacao") pendencias.push("Aguardando aprovação");
  if (
    pedido.fiscal_status &&
    pedido.fiscal_status !== "nao_iniciado" &&
    pedido.fiscal_status !== "emitida"
  )
    pendencias.push(`Fiscal: ${pedido.fiscal_status}`);
  if (pedido.ocorrencia && pedido.ocorrencia.trim().length > 0) pendencias.push("Ocorrência");

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // ignora clique enquanto arrasta
        if (isDragging || dragging) return;
        // Só abre em clique "simples" sem drag
        if (onOpen) onOpen(pedido.id);
        e.stopPropagation();
      }}
      className={cn(
        "cursor-grab active:cursor-grabbing rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        atrasado && "border-l-4 border-l-rose-500",
        pedido.prioridade === "alta" && !atrasado && "border-l-4 border-l-amber-500",
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

      {responsavel && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{responsavel}</span>
        </div>
      )}

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span title="Data do pedido">
            {format(new Date(pedido.created_at), "dd MMM", { locale: ptBR })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" />
          <span title="Dias na etapa atual">{diasNaEtapa}d na etapa</span>
        </div>
        {previsao && (
          <div
            className={cn(
              "flex items-center gap-1.5 col-span-2",
              atrasado && "text-rose-600 font-medium",
            )}
          >
            <Truck className="h-3 w-3 shrink-0" />
            <span>
              Previsão {format(previsao, "dd MMM", { locale: ptBR })}
              {atrasado && ` · atrasado ${differenceInCalendarDays(new Date(), previsao)}d`}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {pedido.proposta_number && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="Proposta origem">
            <FileText className="h-2.5 w-2.5 mr-1" />
            {pedido.proposta_number}
          </Badge>
        )}
        {forma && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="Forma de atendimento">
            <Headphones className="h-2.5 w-2.5 mr-1" />
            {forma}
          </Badge>
        )}
        {pedido.prioridade === "alta" && (
          <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border-amber-500/30">
            <Flame className="h-2.5 w-2.5 mr-1" /> Alta
          </Badge>
        )}
        {pedido.nf_numero && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0" title="Nota fiscal emitida">
            NF {pedido.nf_numero}
          </Badge>
        )}
        {atrasado && (
          <Badge className="text-[10px] px-1.5 py-0 bg-rose-500/15 text-rose-700 border-rose-500/30">
            <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Atrasado
          </Badge>
        )}
        {pendencias.map((p) => (
          <Badge
            key={p}
            variant="outline"
            className="text-[10px] px-1.5 py-0 bg-muted/60"
            title="Pendência / bloqueio"
          >
            {p}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function BackwardMotiveDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingBackward | null;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const open = !!pending;
  const fromLabel = pending ? PEDIDO_STAGES.find((s) => s.id === pending.from)?.label : "";
  const toLabel = pending ? PEDIDO_STAGES.find((s) => s.id === pending.to)?.label : "";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setMotivo("");
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Motivo do retorno de etapa</DialogTitle>
          <DialogDescription>
            {pending?.pedidoNumber}: <b>{fromLabel}</b> ↺ <b>{toLabel}</b>. Registre o motivo — ele
            fica no histórico do pedido.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          placeholder="Ex.: divergência fiscal identificada na conferência; retorno para separação corrigir volume; …"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setMotivo("");
              onCancel();
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={motivo.trim().length < 3}
            onClick={() => {
              onConfirm(motivo.trim());
              setMotivo("");
            }}
          >
            Confirmar retorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
