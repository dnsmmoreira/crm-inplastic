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
import { Plus, Package, Calendar as CalendarIcon, Search, ArrowDownUp, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCrm, STAGES, formatBRL, leadTemperature, followupTemperature, type Lead, type StageId, type FollowupLevel, useVisibleLeads } from "@/lib/crm-store";
import { useMoveLeadStage } from "@/hooks/use-move-lead-stage";
import { computeLeadScore } from "@/lib/lead-score";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewLeadDialog, LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortMode = "default" | "urgency" | "urgency-desc";
const AGENDA_FILTERS: { level: FollowupLevel; label: string; emoji: string }[] = [
  { level: "urgent", label: "Urgente", emoji: "🔥" },
  { level: "attention", label: "Atenção", emoji: "⚠️" },
  { level: "scheduled", label: "Agendado", emoji: "❄️" },
];

export const Route = createFileRoute("/pipeline")({
  component: PipelinePage,
  head: () => ({
    meta: [{ title: "Funil de Vendas — INPLASTIC - CRM" }],
  }),
});

function PipelinePage() {
  const leads = useVisibleLeads();
  const moveLead = useCrm((s) => s.moveLead);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [agendaFilter, setAgendaFilter] = useState<Set<FollowupLevel>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const toggleAgenda = (lvl: FollowupLevel) =>
    setAgendaFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      if (q && !(l.company.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q))) return false;
      if (agendaFilter.size > 0) {
        const lvl = followupTemperature(l).level;
        if (!agendaFilter.has(lvl)) return false;
      }
      return true;
    });
  }, [leads, search, agendaFilter]);

  const byStage = useMemo(() => {
    const rank: Record<FollowupLevel, number> = { urgent: 0, attention: 1, scheduled: 2, ok: 3 };
    const map: Record<StageId, Lead[]> = {
      atendimento: [], novo: [], qualificacao: [], proposta: [], negociacao: [], ganho: [], perdido: [],
    };
    filtered.forEach((l) => map[l.stage].push(l));
    if (sortMode !== "default") {
      const dir = sortMode === "urgency" ? 1 : -1;
      (Object.keys(map) as StageId[]).forEach((k) => {
        map[k] = [...map[k]].sort((a, b) => {
          const fa = followupTemperature(a);
          const fb = followupTemperature(b);
          const r = (rank[fa.level] - rank[fb.level]) * dir;
          if (r !== 0) return r;
          return ((fb.overdueDays ?? -Infinity) - (fa.overdueDays ?? -Infinity)) * dir;
        });
      });
    }
    return map;
  }, [filtered, sortMode]);

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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
        <span className="text-xs font-medium text-muted-foreground px-2">Agenda:</span>
        {AGENDA_FILTERS.map((f) => {
          const active = agendaFilter.has(f.level);
          return (
            <Toggle
              key={f.level}
              pressed={active}
              onPressedChange={() => toggleAgenda(f.level)}
              size="sm"
              className="h-7 gap-1 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
            >
              <span>{f.emoji}</span>
              {f.label}
            </Toggle>
          );
        })}
        {agendaFilter.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setAgendaFilter(new Set())}
          >
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-7 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Ordem padrão</SelectItem>
              <SelectItem value="urgency">Mais urgente primeiro</SelectItem>
              <SelectItem value="urgency-desc">Menos urgente primeiro</SelectItem>
            </SelectContent>
          </Select>
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
  const sc = computeLeadScore(lead);
  const stripe =
    sc.level === "alto" ? "border-l-4 border-l-emerald-500"
    : sc.level === "medio" ? "border-l-4 border-l-amber-500"
    : "border-l-4 border-l-rose-500";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onOpen(lead.id)}
      className={cn(
        "group cursor-grab active:cursor-grabbing rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        stripe,
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
      {(() => {
        const t = leadTemperature(lead);
        const f = followupTemperature(lead);
        return (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${sc.className}`}
              title={sc.reasons.map((r) => `${r.ok ? "✓" : "•"} ${r.text}`).join("\n")}
            >
              <span className="mr-1">{sc.emoji}</span>Score {sc.score}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${t.className}`} title={t.hint}>
              <span className="mr-1">{t.emoji}</span>{t.label} · {t.days}d
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${f.className}`} title={f.hint}>
              <span className="mr-1">{f.emoji}</span>{f.label}
            </Badge>
            {lead.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
