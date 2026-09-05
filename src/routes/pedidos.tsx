import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Search,
  Calendar as CalendarIcon,
  FileText,
  Truck,
  User,
  Clock,
  AlertTriangle,
  Flame,
  Headphones,
  Ban,
  Package,
  Factory,
  PackageCheck,
  CheckCircle2,
  ShieldAlert,
  Timer,
  TrendingUp,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth, hasPerm } from "@/hooks/use-auth";
import { PERM_PEDIDOS_MOVIMENTAR } from "@/lib/permissoes";

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
  podeAssumirPedido,
} from "@/lib/pedidos.functions";
import { PedidoDetailDrawer } from "@/components/pedidos/PedidoDetailDrawer";

export const Route = createFileRoute("/pedidos")({
  component: PedidosKanbanPage,
  // Deep-link vindo de /pendencias: abre o pedido direto no drawer.
  validateSearch: (search: Record<string, unknown>): { pedido?: string } =>
    typeof search["pedido"] === "string" ? { pedido: search["pedido"] as string } : {},
  head: () => ({
    meta: [
      { title: "Funil Operacional — INPLASTIC - CRM" },
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
  const { user } = useAuth();
  // Movimentar cards exige a chave pedidos.movimentar (admin, Financeiro,
  // Operacional). Vendedor comum enxerga o funil em modo leitura.
  const podeMover = hasPerm(user, PERM_PEDIDOS_MOVIMENTAR);

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingBackward, setPendingBackward] = useState<PendingBackward | null>(null);
  const { pedido: pedidoDaUrl } = Route.useSearch();
  const [openPedidoId, setOpenPedidoId] = useState<string | null>(pedidoDaUrl ?? null);
  useEffect(() => {
    if (pedidoDaUrl) setOpenPedidoId(pedidoDaUrl);
  }, [pedidoDaUrl]);
  const [fVendedor, setFVendedor] = useState<string>("all");
  const [fResponsavel, setFResponsavel] = useState<string>("all");
  const [fStage, setFStage] = useState<string>("all");
  const [fForma, setFForma] = useState<string>("all");
  const [tAtrasados, setTAtrasados] = useState(false);
  const [tBloqueados, setTBloqueados] = useState(false);
  const [tOcorrencia, setTOcorrencia] = useState(false);
  const [tReprovados, setTReprovados] = useState(false);

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
    onSuccess: (res, vars) => {
      if (res && "ok" in res && !res.ok) {
        toast.error(res.message);
        void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
      void qc.invalidateQueries({ queryKey: ["pipeline", "leads-com-pedido"] });
      // Entrou no Pós-venda: abre o pedido para comprovar a entrega na hora.
      if (vars.stage === "pos_venda") setOpenPedidoId(vars.pedido_id);
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const allRows = pedidosQ.data ?? [];

  const responsavelOf = (p: PedidoRow) => p.responsavel_nome ?? p.equipe_responsavel ?? null;

  const options = useMemo(() => {
    const vendedores = new Set<string>();
    const responsaveis = new Set<string>();
    const formas = new Set<string>();
    const stages = new Set<string>();
    allRows.forEach((p) => {
      if (p.vendedor_nome) vendedores.add(p.vendedor_nome);
      const r = responsavelOf(p);
      if (r) responsaveis.add(r);
      const f = p.forma_atendimento?.trim();
      if (f) formas.add(f);
      stages.add(p.stage);
    });
    const sortAsc = (a: string, b: string) => a.localeCompare(b, "pt-BR");
    return {
      vendedores: [...vendedores].sort(sortAsc),
      responsaveis: [...responsaveis].sort(sortAsc),
      formas: [...formas].sort(sortAsc),
      stages: PEDIDO_STAGES.filter((s) => stages.has(s.id)),
    };
  }, [allRows]);

  const terminalStages: PedidoStageId[] = ["pos_venda", "reprovado_financeiro"];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const now = new Date();
    return allRows.filter((p) => {
      if (q) {
        const hit = [
          p.number,
          p.lead_company ?? "",
          p.proposta_number ?? "",
          p.nf_numero ?? "",
        ].some((s) => s.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (fVendedor !== "all" && p.vendedor_nome !== fVendedor) return false;
      if (fResponsavel !== "all" && responsavelOf(p) !== fResponsavel) return false;
      if (fStage !== "all" && p.stage !== fStage) return false;
      if (fForma !== "all" && (p.forma_atendimento?.trim() ?? "") !== fForma) return false;

      if (tAtrasados) {
        const prev = p.previsao_entrega ? new Date(p.previsao_entrega) : null;
        const atrasado =
          prev !== null &&
          !terminalStages.includes(p.stage) &&
          differenceInCalendarDays(now, prev) > 0;
        if (!atrasado) return false;
      }
      if (tBloqueados) {
        const fiscalBlock =
          p.fiscal_status === "aguardando_correcao" || p.fiscal_status === "nota_fiscal_cancelada";
        if ((p.ocorrencias_abertas ?? 0) <= 0 && !fiscalBlock) return false;
      }
      if (tOcorrencia && !(p.ocorrencia && p.ocorrencia.trim().length > 0)) return false;
      if (p.stage === "reprovado_financeiro" && !tReprovados) return false;
      if (p.stage === "pos_venda" && p.encerrado_em && !tReprovados) return false;
      return true;
    });
  }, [
    allRows,
    search,
    fVendedor,
    fResponsavel,
    fStage,
    fForma,
    tAtrasados,
    tBloqueados,
    tOcorrencia,
    tReprovados,
  ]);

  const activeFilterCount =
    (fVendedor !== "all" ? 1 : 0) +
    (fResponsavel !== "all" ? 1 : 0) +
    (fStage !== "all" ? 1 : 0) +
    (fForma !== "all" ? 1 : 0) +
    (tAtrasados ? 1 : 0) +
    (tBloqueados ? 1 : 0) +
    (tOcorrencia ? 1 : 0) +
    (tReprovados ? 1 : 0);

  const clearFilters = () => {
    setFVendedor("all");
    setFResponsavel("all");
    setFStage("all");
    setFForma("all");
    setTAtrasados(false);
    setTBloqueados(false);
    setTOcorrencia(false);
    setTReprovados(false);
  };

  const byStage = useMemo(() => {
    const map: Record<PedidoStageId, PedidoRow[]> = {
      analise_financeira: [],
      aguardando_pagamento: [],
      programacao: [],
      em_producao: [],
      pronto: [],
      faturado_em_rota: [],
      pos_venda: [],
      reprovado_financeiro: [],
      cancelado: [],
    };
    filtered.forEach((p) => map[p.stage]?.push(p));
    return map;
  }, [filtered]);

  const activePedido = activeId ? (filtered.find((p) => p.id === activeId) ?? null) : null;

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

    if (target === "pos_venda" && (pedido.ocorrencias_abertas ?? 0) > 0) {
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
          <h1 className="text-2xl md:text-3xl font-semibold">Funil Operacional</h1>
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

      <KpiBar pedidos={filtered} />

      <FilterBar
        options={options}
        fVendedor={fVendedor}
        setFVendedor={setFVendedor}
        fResponsavel={fResponsavel}
        setFResponsavel={setFResponsavel}
        fStage={fStage}
        setFStage={setFStage}
        fForma={fForma}
        setFForma={setFForma}
        tAtrasados={tAtrasados}
        setTAtrasados={setTAtrasados}
        tBloqueados={tBloqueados}
        setTBloqueados={setTBloqueados}
        tOcorrencia={tOcorrencia}
        setTOcorrencia={setTOcorrencia}
        tReprovados={tReprovados}
        setTReprovados={setTReprovados}
        activeCount={activeFilterCount}
        onClear={clearFilters}
        totalCount={allRows.length}
        filteredCount={filtered.length}
      />

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
                stage.id === "pos_venda" &&
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
                  podeMover={podeMover}
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
  blockedReason,
  isBackwardTarget,
  onOpen,
  podeMover,
}: {
  stage: (typeof PEDIDO_STAGES)[number];
  pedidos: PedidoRow[];
  dragActive: boolean;
  canDrop: boolean;
  blockedReason?: string | null;
  isBackwardTarget: boolean;
  onOpen: (id: string) => void;
  podeMover: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: dragActive && !canDrop });
  const total = pedidos.reduce((s, p) => s + p.total, 0);
  const showBlocked = dragActive && !canDrop;
  return (
    <div className="w-[300px] shrink-0 flex flex-col">
      <div className="px-1 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
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
        title={showBlocked && blockedReason ? blockedReason : undefined}
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
              <Ban className="h-3 w-3" /> {blockedReason ?? "Não permitido"}
            </div>
          </div>
        )}
        {pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} onOpen={onOpen} podeMover={podeMover} />
        ))}
        {pedidos.length === 0 && !showBlocked && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">
            {podeMover ? "Solte aqui" : "Sem pedidos"}
          </div>
        )}
      </div>
    </div>
  );
}

function PedidoCard({
  pedido,
  dragging = false,
  onOpen,
  podeMover = true,
}: {
  pedido: PedidoRow;
  dragging?: boolean;
  onOpen?: (id: string) => void;
  podeMover?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: pedido.id,
    disabled: !podeMover,
  });

  const diasNaEtapa = Math.max(
    0,
    differenceInCalendarDays(new Date(), new Date(pedido.stage_changed_at)),
  );

  const terminalStages: PedidoStageId[] = ["pos_venda", "reprovado_financeiro"];
  const previsao = pedido.previsao_entrega ? new Date(pedido.previsao_entrega) : null;
  const atrasado =
    previsao !== null &&
    !terminalStages.includes(pedido.stage) &&
    differenceInCalendarDays(new Date(), previsao) > 0;

  const responsavel =
    pedido.responsavel_nome ?? pedido.equipe_responsavel ?? pedido.vendedor_nome ?? null;
  // Nas etapas operacionais o dono é quem "assumiu" o pedido — sem ele, alerta.
  const etapaOperacional = podeAssumirPedido(pedido.stage);
  const responsavelOperacional = pedido.responsavel_nome ?? pedido.equipe_responsavel ?? null;
  const semResponsavel = etapaOperacional && !responsavelOperacional;
  const nomeCurto = (n: string) => n.trim().split(/\s+/)[0] ?? n;

  const forma = pedido.forma_atendimento?.trim() || null;

  // Resumo do conteúdo do pedido: primeiro item + "+N itens"
  const itens = pedido.itens ?? [];
  const primeiro = itens[0];
  const nomeItem = primeiro
    ? primeiro.description?.trim() || primeiro.sku?.trim() || "Item sem descrição"
    : null;
  const qtdItem = primeiro
    ? `${primeiro.quantity.toLocaleString("pt-BR")}${primeiro.unit ? ` ${primeiro.unit}` : ""}`
    : null;
  const itensTooltip = itens
    .map((i) => {
      const nome = i.description?.trim() || i.sku?.trim() || "Item sem descrição";
      const sku = i.sku?.trim() && i.description?.trim() ? ` (${i.sku.trim()})` : "";
      return `${nome}${sku} — ${i.quantity.toLocaleString("pt-BR")}${i.unit ? ` ${i.unit}` : ""}`;
    })
    .join("\n");

  const pendencias: string[] = [];
  if (pedido.stage === "analise_financeira") pendencias.push("Aguardando aprovação");
  if (pedido.stage === "aguardando_pagamento") pendencias.push("Aguardando pagamento antecipado");
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
      title={podeMover ? undefined : "Somente visualização"}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        podeMover ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
          {nomeItem && (
            <div className="mt-0.5 flex items-baseline gap-1 min-w-0" title={itensTooltip}>
              <span className="text-xs text-foreground/80 truncate">
                {nomeItem}
                {qtdItem ? ` · ${qtdItem}` : ""}
              </span>
              {itens.length > 1 && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  +{itens.length - 1} {itens.length - 1 === 1 ? "item" : "itens"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-primary font-semibold text-sm shrink-0">{formatBRL(pedido.total)}</div>
      </div>

      {etapaOperacional ? (
        <div
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs",
            semResponsavel ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground",
          )}
        >
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {semResponsavel ? "Sem responsável" : nomeCurto(responsavelOperacional!)}
          </span>
        </div>
      ) : responsavel ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{responsavel}</span>
        </div>
      ) : null}

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
        {pedido.stage === "pos_venda" &&
          (pedido.entrega_comprovada_em ? (
            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
              Entrega comprovada
            </Badge>
          ) : (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 border-amber-500/30">
              Sem comprovante
            </Badge>
          ))}
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

function KpiBar({ pedidos }: { pedidos: PedidoRow[] }) {
  const kpis = useMemo(() => {
    const now = new Date();
    const terminal: PedidoStageId[] = ["pos_venda", "reprovado_financeiro"];
    const ativos = pedidos.filter((p) => !terminal.includes(p.stage));
    const valorAtivos = ativos.reduce((s, p) => s + p.total, 0);

    const atrasados = pedidos.filter((p) => {
      if (!p.previsao_entrega) return false;
      if (terminal.includes(p.stage)) return false;
      return differenceInCalendarDays(now, new Date(p.previsao_entrega)) > 0;
    }).length;

    const bloqueados = pedidos.filter((p) => {
      const ocor = (p.ocorrencias_abertas ?? 0) > 0;
      const fiscal =
        p.fiscal_status === "aguardando_correcao" || p.fiscal_status === "nota_fiscal_cancelada";
      return ocor || fiscal;
    }).length;

    const emProducao = pedidos.filter((p) => p.stage === "em_producao").length;
    const aguardSaida = pedidos.filter((p) => p.stage === "pronto").length;
    const emTransporte = pedidos.filter((p) => p.stage === "faturado_em_rota").length;
    const entregues = pedidos.filter((p) => p.stage === "pos_venda").length;
    const comOcorrencia = pedidos.filter((p) => (p.ocorrencias_abertas ?? 0) > 0).length;

    const diasArr = pedidos
      .filter((p) => !terminal.includes(p.stage))
      .map((p) => Math.max(0, differenceInCalendarDays(now, new Date(p.stage_changed_at))));
    const tempoMedio = diasArr.length > 0 ? diasArr.reduce((s, n) => s + n, 0) / diasArr.length : 0;

    const concluidos = pedidos.filter((p) => !!p.encerrado_em).length;
    const total = pedidos.length;
    const pctPosVenda = total > 0 ? (concluidos / total) * 100 : 0;

    return {
      ativos: ativos.length,
      valorAtivos,
      atrasados,
      bloqueados,
      emProducao,
      aguardSaida,
      emTransporte,
      entregues,
      comOcorrencia,
      tempoMedio,
      pctPosVenda,
    };
  }, [pedidos]);

  const cards: Array<{
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "default" | "warning" | "danger" | "success" | "info";
  }> = [
    {
      label: "Ativos",
      value: String(kpis.ativos),
      hint: formatBRL(kpis.valorAtivos),
      icon: Package,
      tone: "default",
    },
    {
      label: "Atrasados",
      value: String(kpis.atrasados),
      icon: AlertTriangle,
      tone: kpis.atrasados > 0 ? "danger" : "default",
    },
    {
      label: "Bloqueados",
      value: String(kpis.bloqueados),
      hint: "ocorrência/fiscal",
      icon: ShieldAlert,
      tone: kpis.bloqueados > 0 ? "warning" : "default",
    },
    { label: "Em produção", value: String(kpis.emProducao), icon: Factory, tone: "info" },
    {
      label: "Aguard. saída",
      value: String(kpis.aguardSaida),
      icon: PackageCheck,
      tone: "info",
    },
    { label: "Em transporte", value: String(kpis.emTransporte), icon: Truck, tone: "info" },
    {
      label: "Entregues",
      value: String(kpis.entregues),
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "Com ocorrência",
      value: String(kpis.comOcorrencia),
      icon: Flame,
      tone: kpis.comOcorrencia > 0 ? "warning" : "default",
    },
    {
      label: "Tempo médio",
      value: `${kpis.tempoMedio.toFixed(1)}d`,
      hint: "na etapa atual",
      icon: Timer,
      tone: "default",
    },
    {
      label: "Pós-venda concluído",
      value: `${kpis.pctPosVenda.toFixed(0)}%`,
      hint: "do total",
      icon: TrendingUp,
      tone: "success",
    },
  ];

  const toneClass: Record<NonNullable<(typeof cards)[number]["tone"]>, string> = {
    default: "text-foreground",
    warning: "text-amber-600",
    danger: "text-rose-600",
    success: "text-emerald-600",
    info: "text-sky-600",
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="rounded-lg border bg-card p-2.5 flex flex-col gap-1 min-w-0"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground min-w-0">
              <Icon className={cn("h-3 w-3 shrink-0", toneClass[c.tone ?? "default"])} />
              <span className="truncate">{c.label}</span>
            </div>
            <div
              className={cn("text-lg font-semibold leading-tight", toneClass[c.tone ?? "default"])}
            >
              {c.value}
            </div>
            {c.hint && <div className="text-[10px] text-muted-foreground truncate">{c.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

type FilterBarProps = {
  options: {
    vendedores: string[];
    responsaveis: string[];
    formas: string[];
    stages: { id: PedidoStageId; label: string; color: string }[];
  };
  fVendedor: string;
  setFVendedor: (v: string) => void;
  fResponsavel: string;
  setFResponsavel: (v: string) => void;
  fStage: string;
  setFStage: (v: string) => void;
  fForma: string;
  setFForma: (v: string) => void;
  tAtrasados: boolean;
  setTAtrasados: (v: boolean) => void;
  tBloqueados: boolean;
  setTBloqueados: (v: boolean) => void;
  tOcorrencia: boolean;
  setTOcorrencia: (v: boolean) => void;
  tReprovados: boolean;
  setTReprovados: (v: boolean) => void;
  activeCount: number;
  onClear: () => void;
  totalCount: number;
  filteredCount: number;
};

function FilterBar(props: FilterBarProps) {
  const {
    options,
    fVendedor,
    setFVendedor,
    fResponsavel,
    setFResponsavel,
    fStage,
    setFStage,
    fForma,
    setFForma,
    tAtrasados,
    setTAtrasados,
    tBloqueados,
    setTBloqueados,
    tOcorrencia,
    setTOcorrencia,
    tReprovados,
    setTReprovados,
    activeCount,
    onClear,
    totalCount,
    filteredCount,
  } = props;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FilterSelect
          value={fVendedor}
          onChange={setFVendedor}
          placeholder="Vendedor"
          allLabel="Todos os vendedores"
          items={options.vendedores.map((v) => ({ value: v, label: v }))}
        />
        <FilterSelect
          value={fResponsavel}
          onChange={setFResponsavel}
          placeholder="Responsável"
          allLabel="Todos os responsáveis"
          items={options.responsaveis.map((v) => ({ value: v, label: v }))}
        />
        <FilterSelect
          value={fStage}
          onChange={setFStage}
          placeholder="Etapa"
          allLabel="Todas as etapas"
          items={options.stages.map((s) => ({ value: s.id, label: s.label }))}
        />
        <FilterSelect
          value={fForma}
          onChange={setFForma}
          placeholder="Forma de atendimento"
          allLabel="Todas as formas"
          items={options.formas.map((v) => ({ value: v, label: v }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleChip active={tAtrasados} onClick={() => setTAtrasados(!tAtrasados)} tone="danger">
          <AlertTriangle className="h-3 w-3 mr-1" /> Atrasados
        </ToggleChip>
        <ToggleChip
          active={tBloqueados}
          onClick={() => setTBloqueados(!tBloqueados)}
          tone="warning"
        >
          <ShieldAlert className="h-3 w-3 mr-1" /> Bloqueados
        </ToggleChip>
        <ToggleChip
          active={tOcorrencia}
          onClick={() => setTOcorrencia(!tOcorrencia)}
          tone="warning"
        >
          <Ban className="h-3 w-3 mr-1" /> Com ocorrência
        </ToggleChip>
        <ToggleChip active={tReprovados} onClick={() => setTReprovados(!tReprovados)} tone="danger">
          <Ban className="h-3 w-3 mr-1" /> Mostrar reprovados/encerrados
        </ToggleChip>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filteredCount} de {totalCount}
          </span>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
              Limpar filtros ({activeCount})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  allLabel: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "danger" | "warning" | "success" | "info";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "danger"
      ? "bg-rose-500/15 text-rose-700 border-rose-500/40"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-700 border-amber-500/40"
        : tone === "success"
          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
          : "bg-sky-500/15 text-sky-700 border-sky-500/40";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? toneCls : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
