import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Plus, Package, Calendar as CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCrm, STAGES, formatBRL, type Lead, type StageId } from "@/lib/crm-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NewLeadDialog, LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pipeline")({
  component: PipelinePage,
  head: () => ({
    meta: [{ title: "Funil de Vendas — CRM Pallet de Plástico" }],
  }),
});

function PipelinePage() {
  const leads = useVisibleLeads();
  const moveLead = useCrm((s) => s.moveLead);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.company.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q),
    );
  }, [leads, search]);

  const byStage = useMemo(() => {
    const map: Record<StageId, Lead[]> = {
      atendimento: [], novo: [], qualificacao: [], proposta: [], negociacao: [], ganho: [], perdido: [],
    };
    filtered.forEach((l) => map[l.stage].push(l));
    return map;
  }, [filtered]);

  const active = activeId ? leads.find((l) => l.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const leadId = String(e.active.id);
    const stage = String(e.over.id) as StageId;
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.stage !== stage) {
      moveLead(leadId, stage);
      const stageLabel = STAGES.find((s) => s.id === stage)?.label;
      toast.success(`${lead.company} → ${stageLabel}`);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Funil de Vendas</h1>
          <p className="text-sm text-muted-foreground">Arraste os cards entre as etapas do processo consultivo</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 sm:w-64"
            />
          </div>
          <NewLeadDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Novo</Button>} />
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 md:-mx-8 px-4 md:px-8">
          {STAGES.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              leads={byStage[stage.id]}
              onOpen={setOpenLead}
            />
          ))}
        </div>
        <DragOverlay>
          {active && <LeadCard lead={active} onOpen={() => {}} dragging />}
        </DragOverlay>
      </DndContext>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function Column({
  stage,
  leads,
  onOpen,
}: {
  stage: (typeof STAGES)[number];
  leads: Lead[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + l.estimatedValue, 0);
  return (
    <div className="w-[300px] shrink-0 flex flex-col">
      <div className="px-1 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="stage-dot" style={{ background: stage.color }} />
          <span className="font-medium text-sm">{stage.label}</span>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{formatBRL(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl border border-dashed p-2 space-y-2 min-h-[400px] transition-colors",
          isOver ? "bg-accent/40 border-primary" : "bg-muted/30 border-border",
        )}
      >
        {leads.map((l) => (
          <LeadCard key={l.id} lead={l} onOpen={onOpen} />
        ))}
        {leads.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">Solte aqui</div>
        )}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onOpen,
  dragging = false,
}: {
  lead: Lead;
  onOpen: (id: string) => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onOpen(lead.id)}
      className={cn(
        "group cursor-grab active:cursor-grabbing rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        isDragging && "opacity-30",
        dragging && "shadow-xl rotate-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm truncate">{lead.company}</div>
        <div className="text-primary font-semibold text-sm shrink-0">
          {formatBRL(lead.estimatedValue)}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="h-3 w-3 shrink-0" />
        <span className="truncate">{lead.product} · {lead.quantity} un.</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarIcon className="h-3 w-3 shrink-0" />
        <span>Último contato {format(new Date(lead.lastContact), "dd MMM", { locale: ptBR })}</span>
      </div>
      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
