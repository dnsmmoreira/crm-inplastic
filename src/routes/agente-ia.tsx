import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bot,
  Calendar as CalendarIcon,
  Sparkles,
  Zap,
  MessageCircle,
  CheckCircle2,
  Clock,
  Mail,
  ChevronRight,
} from "lucide-react";
import { useCrm, type CalendarSlot, useVisibleLeads } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agente-ia")({
  component: AgenteIaPage,
  head: () => ({
    meta: [{ title: "Agente IA — INPLASTIC - CRM" }],
  }),
});

function AgenteIaPage() {
  const agent = useCrm((s) => s.agent);
  const update = useCrm((s) => s.updateAgent);
  const calendar = useCrm((s) => s.calendar);
  const leads = useVisibleLeads();
  const bookSlot = useCrm((s) => s.bookSlotWithAi);
  const runFollowUp = useCrm((s) => s.runAiFollowUp);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const staleLeads = leads
    .filter((l) => !["ganho", "perdido"].includes(l.stage))
    .filter((l) => {
      const days = (Date.now() - new Date(l.lastContact).getTime()) / 86400000;
      return days >= 2;
    })
    .slice(0, 6);

  const days = Array.from(new Set(calendar.map((c) => new Date(c.date).toDateString())))
    .slice(0, 4)
    .map((d) => new Date(d));

  const totalAiActions = leads.reduce((s, l) => s + (l.aiActions?.length ?? 0), 0);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" /> Agente IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Assistente autônomo que faz follow-up, qualifica leads e agenda reuniões
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 h-8 px-3">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {totalAiActions} ações executadas
        </Badge>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="agenda">Agenda do Vendedor</TabsTrigger>
          <TabsTrigger value="log">Atividade da IA</TabsTrigger>
        </TabsList>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-5 space-y-5">
            <header className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Comportamento do Agente</h2>
            </header>

            <SettingRow
              title="Acompanhamento Automático (Follow-up)"
              desc="IA envia mensagem se o lead ficar sem resposta pelo tempo definido."
              checked={agent.autoFollowUp}
              onChange={(v) => update({ autoFollowUp: v })}
            />
            {agent.autoFollowUp && (
              <div className="pl-1">
                <Label className="text-xs">Aguardar sem resposta (horas)</Label>
                <Input
                  type="number"
                  className="mt-1 w-32"
                  value={agent.followUpDelayHours}
                  onChange={(e) => update({ followUpDelayHours: Number(e.target.value) || 24 })}
                />
              </div>
            )}

            <Separator />

            <SettingRow
              title="Agendamento Autônomo"
              desc="IA propõe e confirma reuniões nos horários livres do vendedor."
              checked={agent.autoSchedule}
              onChange={(v) => update({ autoSchedule: v })}
            />
            <SettingRow
              title="Pré-qualificação"
              desc="IA identifica volume, urgência e prioridade automaticamente."
              checked={agent.autoQualify}
              onChange={(v) => update({ autoQualify: v })}
            />

            <Separator />

            <div>
              <Label className="text-xs">Tom de voz</Label>
              <Select value={agent.tone} onValueChange={(v) => update({ tone: v as typeof agent.tone })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultivo">Consultivo (padrão)</SelectItem>
                  <SelectItem value="direto">Direto</SelectItem>
                  <SelectItem value="amigavel">Amigável</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-4">
            <header className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Integração com Agenda</h2>
            </header>

            <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4 flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center text-white",
                agent.calendarConnected ? "bg-emerald-500" : "bg-muted",
              )}>
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {agent.calendarProvider === "google" ? "Google Calendar" : "Outlook Calendar"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {agent.calendarConnected ? `Sincronizado com ${agent.vendorEmail}` : "Não conectado"}
                </div>
              </div>
              <Switch
                checked={agent.calendarConnected}
                onCheckedChange={(v) => {
                  update({ calendarConnected: v });
                  toast[v ? "success" : "info"](v ? "Agenda conectada" : "Agenda desconectada");
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Provedor</Label>
                <Select
                  value={agent.calendarProvider}
                  onValueChange={(v) => update({ calendarProvider: v as "google" | "outlook" })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Calendar</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">E-mail do vendedor</Label>
                <Input
                  className="mt-1"
                  value={agent.vendorEmail}
                  onChange={(e) => update({ vendorEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              A IA lê os horários livres da agenda e propõe ao lead pelo WhatsApp. Reuniões confirmadas aparecem como "Agendado pela IA".
            </div>
          </section>
        </TabsContent>

        {/* AGENDA */}
        <TabsContent value="agenda" className="mt-6 space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <h2 className="font-medium">Próximos horários — {agent.vendorEmail}</h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <LegendDot color="bg-muted" label="Livre" />
                <LegendDot color="bg-rose-400" label="Ocupado" />
                <LegendDot color="bg-primary" label="Agendado pela IA" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {days.map((day) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  slots={calendar.filter((c) => isSameDay(new Date(c.date), day))}
                  leads={leads}
                  onBook={(slot) => {
                    const target = staleLeads[0] ?? leads.find((l) => !["ganho","perdido"].includes(l.stage));
                    if (!target) return toast.error("Sem lead pendente para agendar.");
                    bookSlot(slot.id, target.id, `Call — ${target.contactName} (${target.company})`);
                    toast.success("IA agendou reunião", { description: target.company });
                  }}
                  onOpen={(id) => setOpenLead(id)}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* LOG */}
        <TabsContent value="log" className="mt-6 space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" /> Leads sem resposta — sugestões da IA
              </h2>
              <Button
                size="sm"
                onClick={() => {
                  staleLeads.forEach((l) => runFollowUp(l.id));
                  toast.success(`IA disparou ${staleLeads.length} follow-ups`);
                }}
                disabled={staleLeads.length === 0}
              >
                <Zap className="h-4 w-4 mr-1.5" /> Rodar todos
              </Button>
            </div>
            <ul className="divide-y">
              {staleLeads.map((l) => {
                const days = Math.floor((Date.now() - new Date(l.lastContact).getTime()) / 86400000);
                return (
                  <li key={l.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setOpenLead(l.id)}
                        className="text-left font-medium text-sm hover:text-primary"
                      >
                        {l.company}
                      </button>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="h-3 w-3" /> Sem contato há {days} dias · {l.contactName}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { runFollowUp(l.id); toast.success("IA enviou follow-up"); }}>
                      <Mail className="h-3.5 w-3.5 mr-1.5" /> Follow-up IA
                    </Button>
                  </li>
                );
              })}
              {staleLeads.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum lead precisa de follow-up agora.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-medium flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" /> Últimas ações executadas
            </h2>
            <ul className="space-y-3">
              {leads
                .flatMap((l) => (l.aiActions ?? []).map((a) => ({ lead: l, a })))
                .sort((x, y) => y.a.date.localeCompare(x.a.date))
                .slice(0, 10)
                .map(({ lead, a }) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {a.type === "schedule" ? <CalendarIcon className="h-4 w-4" /> :
                       a.type === "followup" ? <MessageCircle className="h-4 w-4" /> :
                       a.type === "qualify" ? <Sparkles className="h-4 w-4" /> :
                       <Bot className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => setOpenLead(lead.id)} className="text-sm font-medium hover:text-primary">
                        {lead.company} <ChevronRight className="inline h-3 w-3" />
                      </button>
                      <p className="text-sm text-foreground/90">{a.content}</p>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(a.date), "dd MMM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function SettingRow({
  title, desc, checked, onChange,
}: {
  title: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} /> {label}
    </span>
  );
}

function DayColumn({
  day, slots, leads, onBook, onOpen,
}: {
  day: Date;
  slots: CalendarSlot[];
  leads: { id: string; company: string }[];
  onBook: (s: CalendarSlot) => void;
  onOpen: (leadId: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {format(day, "EEEE", { locale: ptBR })}
        </div>
        <div className="font-display font-semibold">
          {format(day, "dd MMM", { locale: ptBR })}
        </div>
      </div>
      <ul className="space-y-1.5">
        {slots.map((s) => {
          const lead = s.leadId ? leads.find((l) => l.id === s.leadId) : null;
          const styles =
            s.status === "livre"
              ? "bg-background hover:bg-accent border-dashed"
              : s.status === "ocupado"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-primary/10 border-primary/30 text-primary";
          return (
            <li
              key={s.id}
              className={cn("rounded-md border px-2.5 py-1.5 text-xs", styles)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{format(new Date(s.date), "HH:mm")}</span>
                <span className="text-[10px] opacity-70">{s.durationMin}min</span>
              </div>
              {s.status === "livre" && (
                <button
                  onClick={() => onBook(s)}
                  className="mt-1 w-full text-[11px] text-primary hover:underline text-left flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" /> Deixar IA agendar
                </button>
              )}
              {s.status !== "livre" && (
                <>
                  <div className="mt-0.5 truncate">{s.title}</div>
                  {s.status === "agendado_ia" && lead && (
                    <button
                      onClick={() => onOpen(lead.id)}
                      className="mt-1 text-[10px] uppercase tracking-wider flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Ver lead
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
