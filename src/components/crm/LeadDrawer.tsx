import React, { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupCnpj } from "@/lib/cnpj.functions";
import { isValidCnpj } from "@/lib/cnpj";
import { useAuth } from "@/hooks/use-auth";
import { dateInputToISO } from "@/lib/format";


import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail,
  Phone,
  Building2,
  Package,
  Calendar,
  MessageSquare,
  StickyNote,
  Users2,
  Trash2,
  Plus,
  Sparkles,
  Bot,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useCrm,
  STAGES,
  PRODUCTS,
  formatBRL,
  leadTemperature,
  followupTemperature,
  proposalTotals,
  leadValueFromProposals,
  type Lead,
  type Interaction,
  type Proposal,
} from "@/lib/crm-store";
import { toast } from "sonner";
import { computeLeadScore, faturamentoTetoPorPorte } from "@/lib/lead-score";
import { useMoveLeadStage } from "@/hooks/use-move-lead-stage";
import { LostReasonDialog, type LostReasonPayload } from "@/components/crm/LostReasonDialog";
import { TabErrorBoundary } from "@/components/crm/TabErrorBoundary";


const TYPE_META: Record<Interaction["type"], { label: string; icon: typeof Mail }> = {
  email: { label: "E-mail", icon: Mail },
  call: { label: "Ligação", icon: Phone },
  meeting: { label: "Reunião", icon: Users2 },
  note: { label: "Anotação", icon: StickyNote },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
};

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const lead = useCrm((s) => s.leads.find((l) => l.id === leadId));
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const updateLead = useCrm((s) => s.updateLead);
  const removeLead = useCrm((s) => s.removeLead);
  const addInteraction = useCrm((s) => s.addInteraction);
  const addTask = useCrm((s) => s.addTask);
  const runFollowUp = useCrm((s) => s.runAiFollowUp);
  const bookSlot = useCrm((s) => s.bookSlotWithAi);
  const calendar = useCrm((s) => s.calendar);
  const proposals = useCrm((s) => s.proposals);
  const moveLeadStage = useMoveLeadStage();
  const [lostReasonOpen, setLostReasonOpen] = useState(false);

  const [newInt, setNewInt] = useState<{ type: Interaction["type"]; content: string }>({
    type: "call",
    content: "",
  });
  const [newTask, setNewTask] = useState({ title: "", dueDate: "" });

  if (!lead) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0 gap-0">
        <SheetHeader className="border-b bg-muted/40 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-xl">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="truncate">{lead.company}</span>
              </SheetTitle>
              <SheetDescription className="mt-1">
                {lead.contactName} · Lead desde {format(new Date(lead.createdAt), "dd MMM yyyy", { locale: ptBR })}
              </SheetDescription>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(() => {
                  const t = leadTemperature(lead);
                  const f = followupTemperature(lead);
                  const sc = computeLeadScore(lead);
                  const dias = Math.floor((Date.now() - new Date(lead.lastContact ?? lead.createdAt).getTime()) / 86400000);
                  const diasClass =
                    dias >= 60 ? "bg-red-500/10 text-red-700 border-red-500/30"
                    : dias >= 45 ? "bg-orange-500/10 text-orange-700 border-orange-500/30"
                    : dias >= 30 ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
                  return (
                    <>
                      <Badge variant="outline" className={`text-xs ${t.className}`} title={t.hint}>
                        <span className="mr-1">{t.emoji}</span>{t.label} · {t.hint}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${f.className}`} title={f.hint}>
                        <span className="mr-1">{f.emoji}</span>Agenda: {f.label} · {f.hint}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${diasClass}`} title="Dias desde o último contato">
                        📅 {dias}d s/ contato
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${sc.className}`}
                        title={sc.reasons.map((r) => `${r.ok ? "✓" : "•"} ${r.text}`).join("\n")}
                      >
                        <span className="mr-1">{sc.emoji}</span>Score {sc.score} · {sc.label}
                      </Badge>
                    </>
                  );
                })()}
                {lead.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>

            </div>
            <div className="text-right shrink-0">
              {(() => {
                const effValor = leadValueFromProposals(lead, proposals);
                const hasProps = proposals.some((p) => p.leadId === lead.id && p.status !== "recusada");
                return (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {hasProps ? "Valor (propostas)" : "Valor estimado"}
                    </div>
                    <div className="font-display text-2xl font-semibold text-primary">
                      {formatBRL(effValor)}
                    </div>
                    {hasProps && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        base: proposta mais relevante
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <EditableRow
              icon={Users2}
              label="Contato"
              value={lead.contactName}
              onCommit={(v) => {
                const t = v.trim();
                if (!t || t === lead.contactName) return;
                updateLead(lead.id, { contactName: t.toUpperCase() });
              }}
            />
            <EditableRow
              icon={Mail}
              label="E-mail"
              type="email"
              value={lead.email}
              onCommit={(v) => {
                const t = v.trim().toLowerCase();
                if (t === lead.email) return;
                updateLead(lead.id, { email: t });
              }}
            />
            <EditableRow
              icon={Phone}
              label="Telefone"
              value={lead.phone}
              onCommit={(v) => {
                const t = v.trim();
                if (t === lead.phone) return;
                updateLead(lead.id, { phone: t });
              }}
            />
            <InfoRow icon={Package} label="Produto" value={lead.product} />
            <InfoRow icon={Calendar} label="Último contato" value={format(new Date(lead.lastContact), "dd/MM/yyyy")} />
            {lead.emailNfXml && <InfoRow icon={Mail} label="E-mail NF (XML)" value={lead.emailNfXml} />}
          </div>


          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Etapa</Label>
              <Select
                value={lead.stage}
                onValueChange={async (v) => {
                  const target = v as Lead["stage"];
                  if (target === lead.stage) return;
                  if (target === "perdido") {
                    setLostReasonOpen(true);
                    return;
                  }
                  const r = await moveLeadStage(lead.id, target, { onGanhoLabel: lead.company });
                  if (r.ok && target !== "ganho") toast.success("Etapa atualizada");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              {(() => {
                const hasProps = proposals.some(
                  (p) => p.leadId === lead.id && p.status !== "recusada",
                );
                if (hasProps) {
                  const eff = leadValueFromProposals(lead, proposals);
                  return (
                    <>
                      <Label className="text-xs">Valor (propostas)</Label>
                      <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                        {formatBRL(eff)}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        calculado da proposta mais relevante
                      </p>
                    </>
                  );
                }
                return (
                  <>
                    <Label className="text-xs">Valor estimado (R$)</Label>
                    <Input
                      type="number"
                      className="mt-1"
                      defaultValue={lead.estimatedValue}
                      onBlur={(e) =>
                        updateLead(lead.id, {
                          estimatedValue: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </>
                );
              })()}
            </div>
          </div>





          {(lead.cnpj || lead.razaoSocial || lead.dataAbertura || lead.capitalSocial || lead.socios?.length || lead.suframa?.length) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro fiscal</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {lead.cnpj && <InfoRow icon={Building2} label="CNPJ" value={lead.cnpj} />}
                  {lead.razaoSocial && <InfoRow icon={Building2} label="Razão social" value={lead.razaoSocial} />}
                  {lead.dataAbertura && <InfoRow icon={Calendar} label="Abertura" value={lead.dataAbertura} />}
                  {lead.capitalSocial ? <InfoRow icon={Package} label="Capital social" value={formatBRL(lead.capitalSocial)} /> : null}
                  {lead.naturezaJuridica && <InfoRow icon={Building2} label="Natureza jurídica" value={lead.naturezaJuridica} />}
                  {lead.porte && <InfoRow icon={Users2} label="Porte" value={lead.porte} />}
                  {lead.cnaePrincipal && <div className="col-span-2"><InfoRow icon={Package} label="CNAE principal" value={lead.cnaePrincipal} /></div>}
                  {lead.simplesOptante !== undefined && (
                    <InfoRow
                      icon={Sparkles}
                      label="Simples Nacional"
                      value={lead.simplesOptante ? `Optante${lead.simplesDesde ? ` desde ${lead.simplesDesde}` : ""}` : "Não optante"}
                    />
                  )}
                </div>
                {lead.suframa && lead.suframa.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">SUFRAMA</div>
                    <ul className="space-y-1 text-sm">
                      {lead.suframa.map((s, i) => (
                        <li key={i} className="rounded border bg-muted/30 px-2 py-1 flex justify-between">
                          <span className="font-mono">{s.numero}</span>
                          <span className="text-xs text-muted-foreground">{s.status}{s.desde ? ` · desde ${s.desde}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {lead.socios && lead.socios.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Quadro societário ({lead.socios.length})</div>
                    <ul className="space-y-1 text-sm">
                      {lead.socios.map((s, i) => (
                        <li key={i} className="rounded border bg-muted/30 px-2 py-1">
                          <div className="font-medium">{s.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.qualificacao}
                            {s.desde ? ` · entrou em ${s.desde}` : ""}
                            {s.taxId ? ` · ${s.taxId}` : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />


          <Tabs defaultValue="hist">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="hist">Histórico</TabsTrigger>
              <TabsTrigger value="propostas">Propostas</TabsTrigger>
              <TabsTrigger value="ia" className="gap-1"><Sparkles className="h-3 w-3" />IA</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
            </TabsList>

            <TabsContent value="hist" className="mt-4 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={newInt.type}
                    onValueChange={(v) => setNewInt({ ...newInt, type: v as Interaction["type"] })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Registrar interação..."
                    value={newInt.content}
                    onChange={(e) => setNewInt({ ...newInt, content: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newInt.content.trim()) return;
                      addInteraction(lead.id, {
                        type: newInt.type,
                        content: newInt.content,
                        date: new Date().toISOString(),
                      });
                      setNewInt({ type: "call", content: "" });
                      toast.success("Interação registrada");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ol className="relative ml-3 space-y-4 border-l pl-5">
                {lead.interactions.map((i) => {
                  const M = TYPE_META[i.type];
                  const Icon = M.icon;
                  return (
                    <li key={i.id} className="relative">
                      <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {M.label} · {format(new Date(i.date), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                      <div className="text-sm">{i.content}</div>
                    </li>
                  );
                })}
              </ol>
            </TabsContent>

            <TabsContent value="propostas" className="mt-4">
              <TabErrorBoundary label="propostas">
                <LeadProposals leadId={lead.id} />
              </TabErrorBoundary>
            </TabsContent>



            <TabsContent value="ia" className="mt-4 space-y-3">
              <div className="rounded-lg border bg-gradient-to-br from-primary/10 to-transparent p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">Agente IA · atuando neste lead</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Envia follow-ups quando o lead fica sem resposta e agenda reuniões na agenda do vendedor automaticamente.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      runFollowUp(lead.id);
                      toast.success("IA enviou follow-up via WhatsApp");
                    }}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Rodar follow-up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const free = calendar.find((c) => c.status === "livre");
                      if (!free) return toast.error("Sem horários livres na agenda.");
                      bookSlot(free.id, lead.id, `Call — ${lead.contactName} (${lead.company})`);
                      toast.success("IA agendou reunião", {
                        description: format(new Date(free.date), "dd MMM 'às' HH:mm", { locale: ptBR }),
                      });
                    }}
                  >
                    <CalendarCheck className="h-3.5 w-3.5 mr-1.5" /> Agendar via IA
                  </Button>
                </div>
              </div>

              {(lead.aiActions?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground italic text-center py-6">
                  A IA ainda não executou ações neste lead.
                </div>
              ) : (
                <ol className="relative ml-3 space-y-4 border-l border-primary/30 pl-5">
                  {lead.aiActions!.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Sparkles className="h-3 w-3" />
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {a.type === "followup" ? "Follow-up automático" :
                         a.type === "schedule" ? "Reunião agendada" :
                         a.type === "qualify" ? "Qualificação" : "Resposta IA"} ·{" "}
                        {format(new Date(a.date), "dd MMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                      <div className="text-sm">{a.content}</div>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="tarefas" className="mt-4 space-y-3">

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Input
                  placeholder="Nova tarefa (ex: Ligar para João na terça)"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  />
                  <Button
                    onClick={() => {
                      if (!newTask.title || !newTask.dueDate) return;
                      addTask({
                        leadId: lead.id,
                        title: newTask.title,
                        dueDate: dateInputToISO(newTask.dueDate),
                      });
                      setNewTask({ title: "", dueDate: "" });
                      toast.success("Tarefa agendada");
                    }}
                  >
                    Agendar
                  </Button>
                </div>
              </div>
              <LeadTasks leadId={lead.id} />
            </TabsContent>

            <TabsContent value="notas" className="mt-4">
              <Textarea
                rows={8}
                defaultValue={lead.notes}
                onBlur={(e) => updateLead(lead.id, { notes: e.target.value })}
                placeholder="Anotações internas sobre o lead..."
              />
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between">
            {isAdmin ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (!confirm(`Excluir lead ${lead.company}? Esta ação não pode ser desfeita.`)) return;
                  removeLead(lead.id);
                  onOpenChange(false);
                  toast.success("Lead removido");
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir lead
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground self-center">
                Apenas administradores podem excluir leads
              </span>
            )}
            <div className="text-xs text-muted-foreground self-center">
              Atualizado {formatDistanceToNow(new Date(lead.lastContact), { locale: ptBR, addSuffix: true })}
            </div>
          </div>

        </div>
      </SheetContent>
      </SheetContent>
    </Sheet>
    <LostReasonDialog
      open={lostReasonOpen}
      leadLabel={lead.company}
      onCancel={() => setLostReasonOpen(false)}
      onConfirm={async (payload) => {
        setLostReasonOpen(false);
        const r = await moveLeadStage(lead.id, "perdido", { onGanhoLabel: lead.company, lostReason: payload });
        if (r.ok) toast.success("Lead marcado como Perdido");
      }}
    />
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate">{value}</div>
      </div>
    </div>
  );
}

function EditableRow({
  icon: Icon,
  label,
  value,
  type = "text",
  onCommit,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  type?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <Input
          type={type}
          defaultValue={value}
          key={value}
          className="h-8 mt-0.5 px-2 text-sm"
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    </div>
  );
}


const PROPOSAL_STATUS_META: Record<Proposal["status"], { label: string; className: string }> = {
  rascunho:              { label: "Rascunho",              className: "bg-muted text-muted-foreground border-muted-foreground/30" },
  enviada:               { label: "Enviada",               className: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/40" },
  aguardando_aprovacao:  { label: "Aguardando aprovação",  className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40" },
  aprovada:              { label: "Aprovada",              className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40" },
  recusada:              { label: "Recusada",              className: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40" },
  pedido:                { label: "Pedido",                className: "bg-primary/15 text-primary border-primary/40" },
};

function LeadProposals({ leadId }: { leadId: string }) {
  const allProposals = useCrm((s) => s.proposals);
  const proposals = React.useMemo(
    () =>
      allProposals
        .filter((p) => p && p.leadId === leadId)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [allProposals, leadId],
  );
  if (proposals.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground italic text-center">
        Nenhuma proposta ou pedido registrado para este lead ainda.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {proposals.map((p) => {
        const t = proposalTotals(p);
        const meta =
          PROPOSAL_STATUS_META[p.status as Proposal["status"]] ??
          { label: String(p.status ?? "—"), className: "bg-muted text-muted-foreground border-muted-foreground/30" };
        const isPedido = p.status === "pedido";
        const dateRef = isPedido && p.orderCreatedAt ? p.orderCreatedAt : p.createdAt;
        return (
          <li key={p.id} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={`/propostas/${p.id}`}
                  className="font-medium text-sm hover:underline"
                >
                  {isPedido ? "Pedido" : "Proposta"} #{p.number}
                </a>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {dateRef ? format(new Date(dateRef), "dd MMM yyyy", { locale: ptBR }) : "—"}
                  {" · "}
                  {t.count} {t.count === 1 ? "item" : "itens"}
                  {t.qty > 0 ? ` · ${t.qty.toLocaleString("pt-BR")} un` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                  {meta.label}
                </Badge>
                <div className="font-semibold text-sm mt-1">{formatBRL(t.total)}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}



function LeadTasks({ leadId }: { leadId: string }) {
  const allTasks = useCrm((s) => s.tasks);
  const tasks = React.useMemo(
    () => allTasks.filter((t) => t.leadId === leadId),
    [allTasks, leadId],
  );
  const toggle = useCrm((s) => s.toggleTask);
  const remove = useCrm((s) => s.removeTask);
  if (tasks.length === 0)
    return <div className="text-sm text-muted-foreground italic">Nenhuma tarefa agendada.</div>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-3 rounded-md border bg-card p-3"
        >
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => toggle(t.id)}
            className="h-4 w-4"
          />
          <div className="flex-1 min-w-0">
            <div className={t.done ? "line-through text-muted-foreground text-sm" : "text-sm"}>{t.title}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(t.dueDate), "dd MMM yyyy", { locale: ptBR })}
            </div>
          </div>
          <button
            onClick={() => remove(t.id)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ------------- New Lead Dialog trigger + form --------
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export function NewLeadDialog({ trigger }: { trigger: React.ReactNode }) {
  const addLead = useCrm((s) => s.addLead);
  const products = useCrm((s) => s.products);
  const leadTags = useCrm((s) => s.leadTags);
  const leadSegments = useCrm((s) => s.leadSegments);
  const [open, setOpen] = useState(false);
  const initial = {
    // Fiscal
    cnpj: "",
    razaoSocial: "",
    company: "",
    nomeFantasia: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    // Contato
    contactName: "",
    email: "",
    phone: "",
    telefoneFixo: "",
    whatsapp: "",
    emailFinanceiro: "",
    emailNfXml: "",
    site: "",
    // Endereço
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    // Comercial
    productId: "",
    quantity: 0,
    estimatedValue: 0,
    stage: "novo" as Lead["stage"],
    segment: "",
    tags: [] as string[],
    notes: "",
    // Qualificação
    porte: "",
    cnaePrincipal: "",
    faturamentoEstimado: 0,
    decisorNome: "",
    decisorCargo: "",
    // Fiscal complementar (CNPJá)
    dataAbertura: "",
    capitalSocial: 0,
    naturezaJuridica: "",
    simplesOptante: null as boolean | null,
    simplesDesde: "",
    suframa: [] as { numero: string; status: string; desde: string; aprovado: boolean }[],
    socios: [] as { nome: string; qualificacao: string; desde: string; taxId?: string }[],

  };
  const [form, setForm] = useState(initial);
  const [lookingUp, setLookingUp] = useState(false);
  const lookupCnpjFn = useServerFn(lookupCnpj);

  const selectedProduct = products.find((p) => p.id === form.productId);

  const recalc = (productId: string, quantity: number) => {
    const prod = products.find((p) => p.id === productId);
    return prod ? prod.defaultPrice * (quantity || 0) : 0;
  };

  const toggleTag = (t: string) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
    }));

  const formatCnpj = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const handleCnpjLookup = async () => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ inválido — informe 14 dígitos");
      return;
    }
    if (!isValidCnpj(digits)) {
      toast.error("CNPJ inválido — confira os dígitos verificadores");
      return;
    }
    setLookingUp(true);
    try {
      const r = await lookupCnpjFn({ data: { cnpj: digits } });
      // Tenta mapear segmento a partir do CNAE (match por palavra no nome do segmento)
      const cnaeLower = (r.cnaePrincipal || "").toLowerCase();
      const matchedSegment =
        leadSegments.find((s) => cnaeLower.includes(s.toLowerCase())) ||
        leadSegments.find((s) => {
          const first = s.toLowerCase().split(/\s+/)[0];
          return first.length > 3 && cnaeLower.includes(first);
        }) ||
        "";
      setForm((f) => ({
        ...f,
        razaoSocial: r.razaoSocial,
        company: (r.nomeFantasia || r.razaoSocial).toUpperCase(),
        nomeFantasia: r.nomeFantasia,
        inscricaoEstadual: r.inscricaoEstadual,
        email: f.email || r.email.toLowerCase(),
        emailNfXml: f.emailNfXml || (r.email ? r.email.toLowerCase() : ""),
        phone: f.phone || r.telefone,
        whatsapp: f.whatsapp || r.telefone,
        telefoneFixo: r.telefone,
        cep: r.endereco.cep,
        logradouro: r.endereco.logradouro,
        numero: r.endereco.numero,
        complemento: r.endereco.complemento,
        bairro: r.endereco.bairro,
        cidade: r.endereco.cidade,
        uf: r.endereco.uf,
        porte: r.porte,
        faturamentoEstimado: f.faturamentoEstimado || faturamentoTetoPorPorte(r.porte) || 0,

        cnaePrincipal: r.cnaePrincipal,
        segment: f.segment || matchedSegment,
        dataAbertura: r.dataAbertura,
        capitalSocial: r.capitalSocial ?? 0,
        naturezaJuridica: r.naturezaJuridica,
        simplesOptante: r.simplesOptante,
        simplesDesde: r.simplesDesde,
        suframa: r.suframa,
        socios: r.socios,
      }));


      toast.success("Dados do CNPJ preenchidos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
        </DialogHeader>

        {/* Bloco: Consulta CNPJ */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Consulta automática (CNPJá)
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCnpjLookup(); } }}
            />
            <Button type="button" onClick={handleCnpjLookup} disabled={lookingUp}>
              {lookingUp ? "Buscando..." : "Buscar"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Preenche razão social, endereço, IE, porte e CNAE automaticamente.
          </p>
        </div>

        {/* Bloco: Dados fiscais */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados fiscais</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Razão social</Label>
              <Input value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} />
            </div>
            <div>
              <Label>Nome fantasia</Label>
              <Input value={form.nomeFantasia} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} />
            </div>
            <div>
              <Label>Empresa (exibição) *</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.inscricaoEstadual} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} />
            </div>
            <div>
              <Label>Inscrição Municipal</Label>
              <Input value={form.inscricaoMunicipal} onChange={(e) => setForm({ ...form, inscricaoMunicipal: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Bloco: Endereço */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço</div>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-2">
              <Label>CEP</Label>
              <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            </div>
            <div className="col-span-4">
              <Label>Logradouro</Label>
              <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
            </div>
            <div className="col-span-1">
              <Label>Nº</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Complemento</Label>
              <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </div>
            <div className="col-span-3">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div className="col-span-4">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>UF</Label>
              <Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
            </div>
          </div>
        </div>

        {/* Bloco: Contato */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contato principal</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Cargo do contato</Label>
              <Input value={form.decisorCargo} onChange={(e) => setForm({ ...form, decisorCargo: e.target.value })} />
            </div>
            <div>
              <Label>Telefone principal</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div>
              <Label>Telefone fixo</Label>
              <Input value={form.telefoneFixo} onChange={(e) => setForm({ ...form, telefoneFixo: e.target.value })} />
            </div>
            <div>
              <Label>Site</Label>
              <Input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
            </div>
            <div>
              <Label>E-mail comercial</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <Label>E-mail financeiro</Label>
              <Input type="email" value={form.emailFinanceiro} onChange={(e) => setForm({ ...form, emailFinanceiro: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <Label>E-mail Nota Fiscal (XML)</Label>
              <Input type="email" value={form.emailNfXml} onChange={(e) => setForm({ ...form, emailNfXml: e.target.value.toLowerCase() })} />
            </div>
          </div>
        </div>

        {/* Bloco: Qualificação */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qualificação comercial</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Porte</Label>
              <Input value={form.porte} onChange={(e) => setForm({ ...form, porte: e.target.value })} />
            </div>
            <div>
              <Label>CNAE principal</Label>
              <Input value={form.cnaePrincipal} onChange={(e) => setForm({ ...form, cnaePrincipal: e.target.value })} />
            </div>
            <div>
              <Label>Faturamento estimado (R$/ano)</Label>
              <Input type="number" min={0} value={form.faturamentoEstimado} onChange={(e) => setForm({ ...form, faturamentoEstimado: Number(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2">
              <Label>Decisor (nome)</Label>
              <Input value={form.decisorNome} onChange={(e) => setForm({ ...form, decisorNome: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Bloco: Cadastro fiscal complementar */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro fiscal (CNPJá)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de abertura</Label>
              <Input type="date" value={form.dataAbertura} onChange={(e) => setForm({ ...form, dataAbertura: e.target.value })} />
            </div>
            <div>
              <Label>Capital social (R$)</Label>
              <Input type="number" min={0} value={form.capitalSocial} onChange={(e) => setForm({ ...form, capitalSocial: Number(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2">
              <Label>Natureza jurídica</Label>
              <Input value={form.naturezaJuridica} onChange={(e) => setForm({ ...form, naturezaJuridica: e.target.value })} />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.simplesOptante === true}
                  onChange={(e) => setForm({ ...form, simplesOptante: e.target.checked })}
                />
                Optante pelo Simples Nacional
              </label>
              {form.simplesOptante && (
                <Input
                  type="date"
                  className="w-44"
                  value={form.simplesDesde ? form.simplesDesde.slice(0, 10) : ""}
                  onChange={(e) => setForm({ ...form, simplesDesde: e.target.value })}
                />
              )}
            </div>
            {form.suframa.length > 0 && (
              <div className="col-span-2">
                <Label>SUFRAMA</Label>
                <ul className="mt-1 space-y-1 text-sm">
                  {form.suframa.map((s, i) => (
                    <li key={i} className="rounded border bg-muted/30 px-2 py-1 flex justify-between">
                      <span className="font-mono">{s.numero}</span>
                      <span className="text-xs text-muted-foreground">{s.status}{s.desde ? ` · desde ${s.desde}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {form.socios.length > 0 && (
              <div className="col-span-2">
                <Label>Quadro societário ({form.socios.length})</Label>
                <ul className="mt-1 space-y-1 text-sm">
                  {form.socios.map((s, i) => (
                    <li key={i} className="rounded border bg-muted/30 px-2 py-1">
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.qualificacao}
                        {s.desde ? ` · entrou em ${s.desde}` : ""}
                        {s.taxId ? ` · ${s.taxId}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>


        {/* Bloco: Classificação & anotações (produto/valor entram via proposta) */}
        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classificação</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Segmento</Label>
              <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione um segmento" /></SelectTrigger>
                <SelectContent>
                  {leadSegments.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Tags</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {leadTags.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    Nenhuma tag cadastrada. Peça ao administrador em Condições Comerciais.
                  </span>
                )}
                {leadTags.map((t) => {
                  const active = form.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`text-xs rounded-full border px-2.5 py-1 transition ${
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Produto, quantidade e valor são registrados na proposta comercial após a qualificação — não no cadastro do lead.
            </p>
          </div>
        </div>


        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.company.trim()) { toast.error("Informe a empresa"); return; }
              try {
                addLead({
                  company: form.company.trim(),
                  contactName: form.contactName.trim(),
                  email: form.email.trim(),
                  phone: form.phone,
                  product: selectedProduct ? selectedProduct.name : "",
                  productId: selectedProduct?.id,
                  quantity: form.quantity,
                  estimatedValue: form.estimatedValue,
                  stage: form.stage,
                  segment: form.segment || undefined,
                  tags: form.tags,
                  source: "Manual",
                  notes: form.notes,
                  cnpj: form.cnpj || undefined,
                  razaoSocial: form.razaoSocial || undefined,
                  nomeFantasia: form.nomeFantasia || undefined,
                  inscricaoEstadual: form.inscricaoEstadual || undefined,
                  inscricaoMunicipal: form.inscricaoMunicipal || undefined,
                  endereco: (form.cep || form.logradouro || form.cidade) ? {
                    cep: form.cep, logradouro: form.logradouro, numero: form.numero,
                    complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, uf: form.uf,
                  } : undefined,
                  emailFinanceiro: form.emailFinanceiro || undefined,
                  emailNfXml: form.emailNfXml || undefined,
                  telefoneFixo: form.telefoneFixo || undefined,
                  whatsapp: form.whatsapp || undefined,
                  site: form.site || undefined,
                  porte: form.porte || undefined,
                  cnaePrincipal: form.cnaePrincipal || undefined,
                  faturamentoEstimado: form.faturamentoEstimado || undefined,
                  decisorNome: form.decisorNome || undefined,
                  decisorCargo: form.decisorCargo || undefined,
                  dataAbertura: form.dataAbertura || undefined,
                  capitalSocial: form.capitalSocial || undefined,
                  naturezaJuridica: form.naturezaJuridica || undefined,
                  simplesOptante: form.simplesOptante ?? undefined,
                  simplesDesde: form.simplesDesde || undefined,
                  suframa: form.suframa.length ? form.suframa : undefined,
                  socios: form.socios.length ? form.socios : undefined,

                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao criar lead");
                return;
              }
              toast.success("Lead criado");
              setOpen(false);
              setForm(initial);
            }}
          >
            Criar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


