import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
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
import { Plus, Package, Calendar as CalendarIcon, Search, ArrowDownUp, X, PackageCheck, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCrm, STAGES, formatBRL, leadTemperature, followupTemperature, proposalTotals, type Lead, type Proposal, type StageId, type FollowupLevel, useVisibleLeads, useVisibleProposals, useLeadValueMap } from "@/lib/crm-store";
import { useMoveLeadStage } from "@/hooks/use-move-lead-stage";
import { LostReasonDialog, type LostReasonPayload } from "@/components/crm/LostReasonDialog";
import { computeLeadScore } from "@/lib/lead-score";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewLeadDialog, LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { gerarPedidoInterno } from "@/lib/pedidos-gerar.functions";

type SortMode = "default" | "urgency" | "urgency-desc";
const CARDS_PER_PAGE = 15;
/**
 * Qualificação e Negociação saíram do quadro: Negociação virou uma tag no card
 * da proposta e Qualificação deixou de existir no funil.
 * Perdido continua no quadro, mas oculto atrás de um toggle.
 */
const HIDDEN_STAGES: StageId[] = ["qualificacao", "negociacao"];
const BOARD_STAGES = STAGES.filter((s) => !HIDDEN_STAGES.includes(s.id));
/** Colunas cujos cards são PROPOSTAS (não leads). */
const PROPOSAL_STAGES: StageId[] = ["proposta", "ganho"];
const PROPOSTA_COLUMN_STATUSES = ["enviada", "aguardando_aprovacao", "aprovada"] as const;

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
  const moveLeadStage = useMoveLeadStage();
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lostTarget, setLostTarget] = useState<{ leadId: string; company: string } | null>(null);
  // Fase 3: por padrão, oculta ganhos que já viraram pedido operacional (não deleta nada).
  const [mostrarGanhosCompletos, setMostrarGanhosCompletos] = useState(false);
  // Coluna Perdido volta ao quadro, oculta por padrão para não poluir.
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLostOpen, setBulkLostOpen] = useState(false);

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

  const proposals = useVisibleProposals();
  const updateProposal = useCrm((s) => s.updateProposal);
  const navigate = useNavigate();
  const gerarPedidoFn = useServerFn(gerarPedidoInterno);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  /** Leads que já têm ao menos uma proposta fora de rascunho saem das colunas de lead. */
  const leadsComProposta = useMemo(
    () => new Set(proposals.filter((p) => p.status !== "rascunho").map((p) => p.leadId)),
    [proposals],
  );

  const matchProposal = useCallback(
    (p: Proposal, q: string) => {
      if (!q) return true;
      const lead = leadById.get(p.leadId);
      return (
        p.number.toLowerCase().includes(q) ||
        (lead?.company.toLowerCase().includes(q) ?? false) ||
        (lead?.product.toLowerCase().includes(q) ?? false)
      );
    },
    [leadById],
  );

  const propostasEnviadas = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter(
      (p) =>
        (PROPOSTA_COLUMN_STATUSES as readonly string[]).includes(p.status) && matchProposal(p, q),
    );
  }, [proposals, search, matchProposal]);

  const propostasGanhas = useMemo(() => {
    const q = search.toLowerCase();
    return proposals.filter((p) => p.status === "pedido" && matchProposal(p, q));
  }, [proposals, search, matchProposal]);

  /** Ganhos = propostas que já viraram pedido; ocultos por padrão. */
  const ganhosOcultos = mostrarGanhosCompletos ? 0 : propostasGanhas.length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      if (HIDDEN_STAGES.includes(l.stage)) return false;
      // Leads perdidos aparecem na própria coluna mesmo se tiveram proposta.
      if (l.stage !== "perdido" && leadsComProposta.has(l.id)) return false;
      if (q && !(l.company.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q))) return false;
      if (agendaFilter.size > 0) {
        const lvl = followupTemperature(l).level;
        if (!agendaFilter.has(lvl)) return false;
      }
      return true;
    });
  }, [leads, search, agendaFilter, leadsComProposta]);

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

  const active = activeId && !activeId.startsWith("prop:") ? leads.find((l) => l.id === activeId) : null;
  const activeProposal =
    activeId && activeId.startsWith("prop:")
      ? (proposals.find((p) => p.id === activeId.slice(5)) ?? null)
      : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const runMove = (leadId: string, stage: StageId, company: string, lostReason?: LostReasonPayload) => {
    void moveLeadStage(leadId, stage, { onGanhoLabel: company, lostReason }).then((r) => {
      if (!r?.ok && r?.reason === "needs_lost_reason") {
        setLostTarget({ leadId, company });
        return;
      }
      if (r?.ok && stage !== "ganho") {
        const stageLabel = STAGES.find((s) => s.id === stage)?.label;
        toast.success(`${company} → ${stageLabel}`);
      }
    });
  };

  const fecharProposta = async (proposal: Proposal) => {
    const lead = leadById.get(proposal.leadId);
    const label = lead?.company ?? proposal.number;
    // Mesma regra do botão "Gerar pedido" da tela da proposta: admin gera direto,
    // vendedor solicita aprovação.
    const requerAprovacao = !isAdmin;
    const t = toast.loading(requerAprovacao ? "Solicitando aprovação..." : "Gerando pedido...");
    try {
      const r = await gerarPedidoFn({
        data: { proposta_id: proposal.id, requer_aprovacao: requerAprovacao },
      });
      toast.dismiss(t);
      if (!r.ok) {
        const erros = r.validacao_erros ?? ["Erro desconhecido"];
        const docMsg = erros.find((m) => /CNPJ ou CPF/i.test(m));
        if (docMsg) {
          toast.error(docMsg, {
            description: "A proposta só fecha com o documento do contato preenchido.",
            duration: 8000,
          });
        } else {
          toast.error("Pendências antes de gerar o pedido", {
            description: erros.join("\n"),
            duration: 8000,
          });
        }
        return;
      }
      if (requerAprovacao) {
        toast.success(`${label} — enviado ao supervisor ADM`);
      } else {
        updateProposal(proposal.id, {
          status: "pedido",
          orderCreatedAt: new Date().toISOString(),
        });
        toast.success(r.pedido_number ? `Pedido ${r.pedido_number} gerado` : `${label} → Ganho`);
        if (r.pedido_id) setRomaneioAlvo({ id: r.pedido_id, number: r.pedido_number });
      }
    } catch (err) {
      toast.dismiss(t);
      toast.error("Erro ao gerar pedido", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const rawId = String(e.active.id);
    const stage = String(e.over.id) as StageId;

    if (rawId.startsWith("prop:")) {
      const proposal = proposals.find((p) => p.id === rawId.slice(5));
      if (proposal && stage === "ganho" && proposal.status !== "pedido") {
        void fecharProposta(proposal);
      }
      return;
    }

    const leadId = rawId;
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.stage !== stage) {
      if (PROPOSAL_STAGES.includes(stage)) {
        toast.info("Crie e envie uma proposta para o lead avançar no funil.");
        return;
      }
      runMove(leadId, stage, lead.company);
    }
  };


  const bulkLabels = useMemo(
    () =>
      Array.from(selected)
        .map((id) => leads.find((l) => l.id === id)?.company ?? id)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [selected, leads],
  );

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const exitSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const runBulkLost = async (payload: LostReasonPayload) => {
    const ids = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const lead = leads.find((l) => l.id === id);
      try {
        const r = await moveLeadStage(id, "perdido", {
          onGanhoLabel: lead?.company,
          lostReason: payload,
        });
        if (r?.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    if (fail === 0) toast.success(`${ok} leads marcados como Perdido`);
    else toast.warning(`${ok} leads marcados como Perdido · ${fail} falharam`);
    exitSelection();
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4 overflow-hidden p-4 md:p-8">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">

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
          {isAdmin && (
            <Button
              variant={selectMode ? "secondary" : "outline"}
              className="gap-2"
              onClick={() => (selectMode ? exitSelection() : setSelectMode(true))}
            >
              <CheckSquare className="h-4 w-4" />
              {selectMode ? "Sair da seleção" : "Selecionar"}
            </Button>
          )}
          <NewLeadDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Novo</Button>} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
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
          <Toggle
            pressed={mostrarGanhosCompletos}
            onPressedChange={setMostrarGanhosCompletos}
            size="sm"
            className="h-7 gap-1 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
            title="Ganhos que já geraram pedido operacional ficam ocultos por padrão. Os dados permanecem no banco."
          >
            <PackageCheck className="h-3 w-3" />
            {mostrarGanhosCompletos
              ? "Ocultar ganhos c/ pedido"
              : `Mostrar ganhos c/ pedido${ganhosOcultos > 0 ? ` (${ganhosOcultos})` : ""}`}
          </Toggle>
          <Toggle
            pressed={mostrarPerdidos}
            onPressedChange={setMostrarPerdidos}
            size="sm"
            className="h-7 gap-1 text-xs data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"
            title="Leads marcados como Perdido. Ficam ocultos por padrão; os dados permanecem no banco."
          >
            <X className="h-3 w-3" />
            {mostrarPerdidos
              ? "Ocultar perdidos"
              : `Mostrar perdidos${byStage.perdido.length > 0 ? ` (${byStage.perdido.length})` : ""}`}
          </Toggle>
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
        <div className="-mx-4 min-h-0 flex-1 overflow-auto px-4 md:-mx-8 md:px-8">
          <div className="flex gap-4 pb-4">
            {BOARD_STAGES.map((stage) =>
              stage.id === "perdido" && !mostrarPerdidos ? null :
              PROPOSAL_STAGES.includes(stage.id) ? (
                <ProposalColumn
                  key={stage.id}
                  stage={stage}
                  proposals={
                    stage.id === "ganho"
                      ? mostrarGanhosCompletos
                        ? propostasGanhas
                        : []
                      : propostasEnviadas
                  }
                  leadById={leadById}
                  onOpen={(id) => navigate({ to: "/propostas/$id", params: { id } })}
                  onToggleNegociacao={(p) => updateProposal(p.id, { emNegociacao: !p.emNegociacao })}
                />
              ) : (
                <Column
                  key={stage.id}
                  stage={stage}
                  leads={byStage[stage.id]}
                  onOpen={setOpenLead}
                  selectMode={selectMode}
                  selected={selected}
                  onToggleSelect={toggleSelected}
                  onSelectMany={selectMany}
                />
              ),
            )}
          </div>
        </div>

        <DragOverlay>
          {active && <LeadCard lead={active} onOpen={() => {}} dragging />}
          {activeProposal && (
            <ProposalCard
              proposal={activeProposal}
              lead={leadById.get(activeProposal.leadId)}
              onOpen={() => {}}
              onToggleNegociacao={() => {}}
              dragging
            />
          )}
        </DragOverlay>
      </DndContext>

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {selected.size} lead{selected.size > 1 ? "s" : ""} selecionado{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={exitSelection}>Cancelar</Button>
              <Button variant="destructive" onClick={() => setBulkLostOpen(true)}>
                Marcar como Perdido
              </Button>
            </div>
          </div>
        </div>
      )}

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
      <LostReasonDialog
        open={!!lostTarget}
        leadLabel={lostTarget?.company}
        onCancel={() => setLostTarget(null)}
        onConfirm={async (payload) => {
          if (!lostTarget) return;
          const { leadId, company } = lostTarget;
          setLostTarget(null);
          runMove(leadId, "perdido", company, payload);
        }}
      />
      <LostReasonDialog
        open={bulkLostOpen}
        leadLabels={bulkLabels}
        onCancel={() => setBulkLostOpen(false)}
        onConfirm={async (payload) => {
          setBulkLostOpen(false);
          await runBulkLost(payload);
        }}
      />
    </div>
  );
}

function Column({
  stage,
  leads,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
  onSelectMany,
}: {
  stage: (typeof STAGES)[number];
  leads: Lead[];
  onOpen: (id: string) => void;
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[], on: boolean) => void;
}) {

  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const valueMap = useLeadValueMap();
  const total = leads.reduce((s, l) => s + (valueMap.get(l.id) ?? l.estimatedValue), 0);

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(leads.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * CARDS_PER_PAGE;
  const visible = leads.slice(start, start + CARDS_PER_PAGE);

  const visibleIds = visible.map((l) => l.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="w-[300px] shrink-0 flex flex-col">
      <div className="sticky top-0 z-20 px-1 pb-2 pt-1 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-2">
          {selectMode && (
            <Checkbox
              checked={allVisibleSelected}
              disabled={visibleIds.length === 0}
              aria-label={`Selecionar cards visíveis de ${stage.label}`}
              onCheckedChange={(v) => onSelectMany(visibleIds, v === true)}
            />
          )}
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
        {visible.map((l) => (
          <LeadCard
            key={l.id}
            lead={l}
            onOpen={onOpen}
            selectMode={selectMode}
            isSelected={selected.has(l.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}

        {leads.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">Solte aqui</div>
        )}
        {leads.length > CARDS_PER_PAGE && (
          <div className="flex items-center justify-between gap-1 border-t pt-2 text-[11px] text-muted-foreground">
            <span>
              {start + 1}–{start + visible.length} de {leads.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Página anterior"
                disabled={safePage === 0}
                onClick={() => setPage(Math.max(0, safePage - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Próxima página"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({

  lead,
  onOpen,
  dragging = false,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  lead: Lead;
  onOpen: (id: string) => void;
  dragging?: boolean;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled: selectMode });
  const sc = computeLeadScore(lead);
  const valueMap = useLeadValueMap();
  const effValue = valueMap.get(lead.id) ?? lead.estimatedValue;
  const stripe =
    sc.level === "alto" ? "border-l-4 border-l-emerald-500"
    : sc.level === "medio" ? "border-l-4 border-l-amber-500"
    : "border-l-4 border-l-rose-500";
  const dragProps = selectMode ? {} : { ...attributes, ...listeners };
  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      onClick={() => {
        if (selectMode) {
          onToggleSelect?.(lead.id);
          return;
        }
        if (!isDragging) onOpen(lead.id);
      }}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all",
        selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        stripe,
        isDragging && "opacity-30",
        dragging && "shadow-xl rotate-2",
        selectMode && isSelected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {selectMode && (
            <Checkbox
              checked={isSelected}
              aria-label={`Selecionar ${lead.company}`}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => onToggleSelect?.(lead.id)}
            />
          )}
          <div className="font-medium text-sm truncate">{lead.company}</div>
        </div>
        <div className="text-primary font-semibold text-sm shrink-0">
          {formatBRL(effValue)}
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

function ProposalColumn({
  stage,
  proposals,
  leadById,
  onOpen,
  onToggleNegociacao,
}: {
  stage: (typeof STAGES)[number];
  proposals: Proposal[];
  leadById: Map<string, Lead>;
  onOpen: (propostaId: string) => void;
  onToggleNegociacao: (p: Proposal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = proposals.reduce((s, p) => s + proposalTotals(p).total, 0);

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(proposals.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * CARDS_PER_PAGE;
  const visible = proposals.slice(start, start + CARDS_PER_PAGE);

  return (
    <div className="w-[300px] shrink-0 flex flex-col">
      <div className="sticky top-0 z-20 px-1 pb-2 pt-1 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-2">
          <span className="stage-dot" style={{ background: stage.color }} />
          <span className="font-medium text-sm">{stage.label}</span>
          <Badge variant="secondary" className="text-xs">{proposals.length}</Badge>
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
        {visible.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            lead={leadById.get(p.leadId)}
            onOpen={onOpen}
            onToggleNegociacao={onToggleNegociacao}
          />
        ))}

        {proposals.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">Solte aqui</div>
        )}
        {proposals.length > CARDS_PER_PAGE && (
          <div className="flex items-center justify-between gap-1 border-t pt-2 text-[11px] text-muted-foreground">
            <span>
              {start + 1}–{start + visible.length} de {proposals.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Página anterior"
                disabled={safePage === 0}
                onClick={() => setPage(Math.max(0, safePage - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Próxima página"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  lead,
  onOpen,
  onToggleNegociacao,
  dragging = false,
}: {
  proposal: Proposal;
  lead?: Lead;
  onOpen: (propostaId: string) => void;
  onToggleNegociacao: (p: Proposal) => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `prop:${proposal.id}` });
  const totals = proposalTotals(proposal);
  const first = proposal.items[0];
  const extras = Math.max(0, proposal.items.length - 1);
  const base = proposal.sentAt ?? proposal.createdAt;
  const dias = Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86400000));

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onOpen(proposal.id);
      }}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing border-l-4",
        proposal.emNegociacao ? "border-l-orange-500" : "border-l-sky-500",
        isDragging && "opacity-30",
        dragging && "shadow-xl rotate-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium text-sm truncate">{lead?.company ?? "—"}</div>
        <div className="text-primary font-semibold text-sm shrink-0">{formatBRL(totals.total)}</div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {first ? `${first.description} · ${first.quantity} un.` : "Sem itens"}
          {extras > 0 ? ` +${extras}` : ""}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarIcon className="h-3 w-3 shrink-0" />
        <span>Proposta {proposal.number} · {dias}d</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge
          variant="outline"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleNegociacao(proposal);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "cursor-pointer text-[10px] px-1.5 py-0",
            proposal.emNegociacao
              ? "border-orange-500 text-orange-600 bg-orange-500/10"
              : "text-muted-foreground",
          )}
          title="Alternar marcação de negociação"
        >
          <span className="mr-1">🔥</span>
          {proposal.emNegociacao ? "Negociação" : "Marcar negociação"}
        </Badge>
      </div>
    </div>
  );
}
